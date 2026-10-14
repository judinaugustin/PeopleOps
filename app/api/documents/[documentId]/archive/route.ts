import { pool } from "@/lib/db";
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const archived = await client.query(
      "UPDATE documents SET status='archived',archived_at=now() WHERE id=$1 AND organization_id=$2 AND status='published' RETURNING id",
      [documentId, user.organization_id],
    );
    if (!archived.rowCount) {
      await client.query("ROLLBACK");
      return jsonError(404, "NOT_FOUND", "Published policy not found.");
    }
    await client.query(
      "INSERT INTO audit_events(actor_user_id,organization_id,action,entity_type,entity_id) VALUES($1,$2,'policy.archived','document',$3)",
      [user.id, user.organization_id, documentId],
    );
    await client.query("COMMIT");
    return Response.json({ id: documentId, status: "archived" });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return jsonError(500, "ARCHIVE_FAILED", "Policy could not be archived.");
  } finally {
    client.release();
  }
}
