import { query } from "@/lib/db";
import { embedChunks } from "@/lib/ai";
import { jsonError } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  if (!process.env.OPENAI_API_KEY)
    return jsonError(
      409,
      "NO_AI_KEY",
      "Add a server-side OpenAI key to retry semantic indexing.",
    );
  const { documentId } = await params;
  const doc = await query<{ status: string }>(
    "SELECT status FROM documents WHERE id=$1 AND organization_id=$2 AND status IN ('draft','failed','published')",
    [documentId, user.organization_id],
  );
  if (!doc.rowCount) return jsonError(404, "NOT_FOUND", "Policy not found.");
  try {
    const pending = await query<{ id: string; content: string }>(
      "SELECT id,content FROM document_chunks WHERE document_id=$1 AND (embedding IS NULL OR embedding_model IS DISTINCT FROM $2) ORDER BY chunk_index",
      [
        documentId,
        process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      ],
    );
    const indexed = await embedChunks(pending.rows);
    await query(
      "UPDATE documents SET status='draft' WHERE id=$1 AND status='failed'",
      [documentId],
    );
    return Response.json({
      id: documentId,
      indexedCount: indexed,
      status: doc.rows[0].status === "failed" ? "draft" : doc.rows[0].status,
    });
  } catch {
    return jsonError(
      503,
      "INDEXING_FAILED",
      "Policy indexing is still unavailable. Try again later.",
    );
  }
}
