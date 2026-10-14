import { query } from "@/lib/db";
import { requireUser } from "@/lib/security";
import { jsonError } from "@/lib/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { documentId } = await params;
  const admin = user.role === "admin";
  const audiences =
    user.role === "employee"
      ? ["all", "employee"]
      : user.role === "hr"
        ? ["all", "employee", "hr"]
        : ["all", "employee", "hr", "admin"];
  const { rows } = await query(
    `SELECT d.id,d.title,d.document_type,d.status,d.version_label,d.effective_from,d.effective_to,d.content FROM documents d WHERE d.id=$1 AND d.organization_id=$2 AND ($3::boolean OR (d.status='published' AND d.audience_scope=ANY($4::text[])))`,
    [documentId, user.organization_id, admin, audiences],
  );
  if (!rows[0]) return jsonError(404, "NOT_FOUND", "Policy not found.");
  const chunks = await query<{ chunk_index: number; content: string }>(
    "SELECT chunk_index,content FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index LIMIT 3",
    [documentId],
  );
  return Response.json({ document: rows[0], chunks: chunks.rows });
}
