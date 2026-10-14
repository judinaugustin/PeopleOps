import { createHash, randomUUID } from "node:crypto";
import { pool, query } from "@/lib/db";
import { chunkText } from "@/lib/chunk";
import { embedChunks } from "@/lib/ai";
import { jsonError } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);
const isIsoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const admin = user.role === "admin";
  const audiences =
    user.role === "employee"
      ? ["all", "employee"]
      : user.role === "hr"
        ? ["all", "employee", "hr"]
        : ["all", "employee", "hr", "admin"];
  const { rows } = await query(
    `SELECT d.id,d.title,d.document_type,d.audience_scope,d.status,d.version_label,d.effective_from,d.effective_to,d.source_filename,d.byte_size,d.created_at,(SELECT count(*) FROM document_chunks c WHERE c.document_id=d.id) AS chunk_count FROM documents d WHERE d.organization_id=$1 AND (($2::boolean) OR (d.status='published' AND d.audience_scope=ANY($3::text[]) AND d.effective_from<=CURRENT_DATE AND (d.effective_to IS NULL OR d.effective_to>=CURRENT_DATE))) ORDER BY d.created_at DESC`,
    [user.organization_id, admin, audiences],
  );
  const embeddingModel =
    process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const coverage = await query<{ total: string; indexed: string }>(
    `SELECT count(*) AS total,count(*) FILTER(WHERE c.embedding IS NOT NULL AND c.embedding_model=$2) AS indexed
     FROM document_chunks c JOIN documents d ON d.id=c.document_id
     WHERE d.organization_id=$1 AND d.status='published' AND d.audience_scope=ANY($3::text[])
       AND d.effective_from<=CURRENT_DATE AND (d.effective_to IS NULL OR d.effective_to>=CURRENT_DATE)`,
    [user.organization_id, embeddingModel, audiences],
  );
  const totalChunks = Number(coverage.rows[0]?.total ?? 0);
  const indexedChunks = Number(coverage.rows[0]?.indexed ?? 0);
  return Response.json({
    documents: rows,
    mode: !process.env.OPENAI_API_KEY
      ? "demo_lexical"
      : totalChunks > 0 && totalChunks === indexedChunks
        ? "ai_ready"
        : "ai_indexing",
    ai: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      embeddingModel: process.env.OPENAI_API_KEY ? embeddingModel : null,
      indexedChunks,
      totalChunks,
    },
  });
}
export async function POST(request: Request) {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return jsonError(
        400,
        "FILE_REQUIRED",
        "Choose a Markdown or text policy file.",
      );
    if (file.size < 1 || file.size > maxBytes)
      return jsonError(
        413,
        "FILE_SIZE",
        `File must be smaller than the configured ${Math.floor(maxBytes / 1_048_576)} MB limit.`,
      );
    const filename = file.name.replace(/[\\/\0-\x1f]/g, "_").slice(-180);
    const ext = filename.toLowerCase().split(".").pop();
    if (!["md", "txt"].includes(ext ?? ""))
      return jsonError(
        415,
        "FILE_TYPE",
        "Only .md and .txt files are supported.",
      );
    if (
      file.type &&
      !["text/plain", "text/markdown", "text/x-markdown"].includes(file.type)
    )
      return jsonError(
        415,
        "FILE_TYPE",
        "The selected file must be plain text or Markdown.",
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return jsonError(400, "INVALID_ENCODING", "Use a UTF-8 text file.");
    }
    if (content.includes("\u0000") || content.trim().length < 30)
      return jsonError(400, "EMPTY_DOCUMENT", "This file has no usable text.");
    const title = String(form.get("title") ?? filename)
      .trim()
      .slice(0, 160);
    const type = String(form.get("documentType") ?? "general")
      .trim()
      .slice(0, 40);
    const audience = String(form.get("audience") ?? "all");
    const effective = String(
      form.get("effectiveFrom") ?? new Date().toISOString().slice(0, 10),
    );
    const effectiveTo = String(form.get("effectiveTo") ?? "").trim();
    if (
      !title ||
      ![
        "general",
        "leave",
        "onboarding",
        "relocation",
        "expenses",
        "remote_work",
        "benefits",
      ].includes(type) ||
      !isIsoDate(effective) ||
      !["all", "employee", "hr", "admin"].includes(audience) ||
      (effectiveTo && (!isIsoDate(effectiveTo) || effectiveTo < effective))
    )
      return jsonError(
        400,
        "INVALID_METADATA",
        "Check the policy title, audience, and effective date.",
      );
    const sha = createHash("sha256").update(bytes).digest("hex");
    const id = randomUUID();
    const prior = await query<{ version_label: string }>(
      "SELECT version_label FROM documents WHERE organization_id=$1 AND title=$2 ORDER BY created_at DESC LIMIT 1",
      [user.organization_id, title],
    );
    const currentVersion = prior.rows[0]?.version_label.match(/^(\d+)\.(\d+)$/);
    const versionLabel = currentVersion
      ? `${currentVersion[1]}.${Number(currentVersion[2]) + 1}`
      : prior.rows[0]
        ? `${prior.rows[0].version_label}.1`
        : "1.0";
    const chunks = chunkText(content);
    const client = await pool.connect();
    let chunkRows: { id: string; content: string }[];
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        "INSERT INTO documents(id,organization_id,title,document_type,audience_scope,status,version_label,effective_from,effective_to,source_filename,sha256,mime_type,byte_size,content,created_by) VALUES($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(organization_id,sha256) DO NOTHING RETURNING id",
        [
          id,
          user.organization_id,
          title,
          type,
          audience,
          versionLabel,
          effective,
          effectiveTo || null,
          filename,
          sha,
          file.type || "text/plain",
          file.size,
          content,
          user.id,
        ],
      );
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return jsonError(
          409,
          "DUPLICATE_DOCUMENT",
          "An identical document already exists.",
        );
      }
      const insertedChunks = await client.query<{
        id: string;
        content: string;
      }>(
        `INSERT INTO document_chunks(document_id,organization_id,chunk_index,content,token_count)
         SELECT $1,$2,(p.chunk_index-1)::integer,p.content,ceil(char_length(p.content)/4.0)::integer
         FROM unnest($3::text[]) WITH ORDINALITY AS p(content,chunk_index)
         RETURNING id,content`,
        [id, user.organization_id, chunks],
      );
      chunkRows = insertedChunks.rows;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    let embedded = 0;
    try {
      embedded = await embedChunks(chunkRows);
    } catch {
      await query("UPDATE documents SET status='failed' WHERE id=$1", [id]);
      return jsonError(
        503,
        "EMBEDDING_FAILED",
        "The policy was saved but indexing failed. Retry after checking the server's AI configuration.",
      );
    }
    return Response.json(
      {
        id,
        status: "draft",
        chunkCount: chunks.length,
        embeddingCount: embedded,
        preview: chunks.slice(0, 3),
      },
      { status: 201 },
    );
  } catch {
    return jsonError(
      400,
      "UPLOAD_FAILED",
      "Could not process this policy file. Use a valid UTF-8 .md or .txt file.",
    );
  }
}
