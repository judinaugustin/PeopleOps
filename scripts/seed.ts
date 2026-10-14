import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hashPassword } from "@/lib/security";
import { pool } from "@/lib/db";
import { chunkText } from "@/lib/chunk";
import { embedChunks } from "@/lib/ai";
import { demoPolicyVersions } from "./policy-catalog";

const legacyPolicyTitles = [
  "Northstar Leave and Time Away Policy",
  "Northstar New Starter Guide",
  "Northstar Business Expense Policy",
  "Northstar Remote Work Guide",
  "Northstar Relocation Support Guide",
];
async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SEED_DEMO_USERS !== "true"
  ) {
    console.log("Demo seeding disabled in production.");
    return;
  }
  const org = await pool.query<{ id: string }>(
    `INSERT INTO organizations(name) VALUES('Northstar Demo Organization') ON CONFLICT(name) DO NOTHING RETURNING id`,
  );
  let organizationId = org.rows[0]?.id;
  if (!organizationId)
    organizationId = (
      await pool.query<{ id: string }>(
        "SELECT id FROM organizations ORDER BY created_at LIMIT 1",
      )
    ).rows[0]?.id;
  if (!organizationId) throw new Error("Could not create demo organization");
  const accounts = [
    [
      "employee@northstar.example",
      "Avery Employee",
      "employee",
      process.env.DEMO_EMPLOYEE_PASSWORD ?? "change-me-employee",
    ],
    [
      "hr@northstar.example",
      "Riley Reviewer",
      "hr",
      process.env.DEMO_HR_PASSWORD ?? "change-me-hr",
    ],
    [
      "admin@northstar.example",
      "Jordan Admin",
      "admin",
      process.env.DEMO_ADMIN_PASSWORD ?? "change-me-admin",
    ],
  ] as const;
  for (const [email, name, role, password] of accounts) {
    const found = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email=$1",
      [email],
    );
    if (found.rowCount) continue;
    const { salt, hash } = await hashPassword(password);
    await pool.query(
      "INSERT INTO users(organization_id,email,name,role,password_salt,password_hash) VALUES($1,$2,$3,$4,$5,$6)",
      [organizationId, email, name, role, salt, hash],
    );
  }
  const admin = (
    await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE role='admin' AND organization_id=$1 LIMIT 1",
      [organizationId],
    )
  ).rows[0]?.id;
  // Hide the original one-paragraph demo records from current policy search.
  // Their chunks remain linked so any existing demo citations still resolve.
  await pool.query(
    `UPDATE documents SET status='archived',archived_at=COALESCE(archived_at,now())
     WHERE organization_id=$1 AND status='published' AND title=ANY($2::text[])
       AND source_filename=title`,
    [organizationId, legacyPolicyTitles],
  );

  for (const doc of demoPolicyVersions) {
    const body = await readFile(
      resolve(process.cwd(), "docs", "demo-policies", doc.filename),
      "utf8",
    );
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO documents(organization_id,title,document_type,audience_scope,status,version_label,effective_from,effective_to,source_filename,sha256,mime_type,byte_size,content,created_by,published_by,published_at)
      VALUES($1,$2,$3,'all','published',$4,$5,$6,$7,$8,'text/markdown',$9,$10,$11,$11,now()) ON CONFLICT(organization_id,sha256) DO NOTHING RETURNING id`,
      [
        organizationId,
        doc.title,
        doc.type,
        doc.version,
        doc.effectiveFrom,
        doc.effectiveTo,
        doc.filename,
        createHash("sha256").update(body).digest("hex"),
        Buffer.byteLength(body),
        body,
        admin,
      ],
    );
    const documentId =
      rows[0]?.id ??
      (
        await pool.query<{ id: string }>(
          "SELECT id FROM documents WHERE organization_id=$1 AND sha256=$2",
          [organizationId, createHash("sha256").update(body).digest("hex")],
        )
      ).rows[0]?.id;
    if (!documentId)
      throw new Error(`Could not load seed document: ${doc.title}`);
    const parts = chunkText(body);
    for (let index = 0; index < parts.length; index++)
      await pool.query(
        "INSERT INTO document_chunks(document_id,organization_id,chunk_index,content,token_count) VALUES($1,$2,$3,$4,$5) ON CONFLICT(document_id,chunk_index) DO NOTHING",
        [
          documentId,
          organizationId,
          index,
          parts[index],
          Math.ceil(parts[index].length / 4),
        ],
      );
    if (process.env.OPENAI_API_KEY) {
      const embeddingModel =
        process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
      const pending = await pool.query<{ id: string; content: string }>(
        "SELECT id,content FROM document_chunks WHERE document_id=$1 AND (embedding IS NULL OR embedding_model IS DISTINCT FROM $2)",
        [documentId, embeddingModel],
      );
      if (pending.rows.length) {
        try {
          await embedChunks(pending.rows);
        } catch (error) {
          console.error(
            `Could not embed seed policy ${doc.title}; after fixing the API configuration, rerun npm run db:seed.`,
            error instanceof Error ? error.message : "unknown embedding error",
          );
          throw error;
        }
      }
    }
  }
  console.log(
    "Seeded fictional policies and development demo accounts (only missing accounts are added).",
  );
}
main()
  .catch((error) => {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
