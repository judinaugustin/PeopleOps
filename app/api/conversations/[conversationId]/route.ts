import { query } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { conversationId } = await params;
  const owned = await query<{ id: string; title: string }>(
    "SELECT id,title FROM conversations WHERE id=$1 AND user_id=$2",
    [conversationId, user.id],
  );
  if (!owned.rows[0])
    return jsonError(404, "NOT_FOUND", "Conversation not found.");
  const { rows } = await query(
    `SELECT m.id,m.role,m.content,m.answer_status,m.created_at,
      COALESCE((SELECT json_agg(json_build_object(
        'id',c.id,'documentId',d.id,'title',d.title,'version',d.version_label,
        'effectiveFrom',d.effective_from,'quote',c.content
      ) ORDER BY mc.display_order)
      FROM message_citations mc
      JOIN document_chunks c ON c.id=mc.chunk_id
      JOIN documents d ON d.id=c.document_id
      WHERE mc.message_id=m.id),'[]'::json) AS citations
      FROM messages m WHERE m.conversation_id=$1 ORDER BY m.created_at`,
    [conversationId],
  );
  return Response.json({ conversation: owned.rows[0], messages: rows });
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  const { conversationId } = await params;
  const result = await query(
    "DELETE FROM conversations WHERE id=$1 AND user_id=$2 RETURNING id",
    [conversationId, user.id],
  );
  return result.rowCount
    ? Response.json({ ok: true })
    : jsonError(404, "NOT_FOUND", "Conversation not found.");
}
