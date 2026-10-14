import { query } from "@/lib/db";
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
  const { documentId } = await params;
  const result = await query<{ id: string }>(
    `UPDATE documents SET status='published',published_by=$3,published_at=now() WHERE id=$1 AND organization_id=$2 AND status='draft' AND EXISTS(SELECT 1 FROM document_chunks WHERE document_id=$1) AND ($4::boolean=false OR NOT EXISTS(SELECT 1 FROM document_chunks c WHERE c.document_id=$1 AND (c.embedding IS NULL OR c.embedding_model IS DISTINCT FROM $5))) RETURNING id`,
    [
      documentId,
      user.organization_id,
      user.id,
      Boolean(process.env.OPENAI_API_KEY),
      process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    ],
  );
  if (!result.rowCount)
    return jsonError(
      409,
      "NOT_READY",
      "Policy text or live embeddings are incomplete. Preview and retry indexing before publication.",
    );
  return Response.json({ id: documentId, status: "published" });
}
