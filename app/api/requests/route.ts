import { z } from "zod";
import { pool, query } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
const schema = z.object({
  category: z.enum([
    "policy_question",
    "onboarding",
    "relocation",
    "expense",
    "other",
  ]),
  subject: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  submit: z.boolean().optional(),
});
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { rows } = await query(
    `SELECT r.id,r.category,r.subject,r.description,r.status,r.submitted_at,r.created_at,r.updated_at,u.name AS requester,
      COALESCE((SELECT json_agg(json_build_object('id',e.id,'actor',a.name,'actorRole',a.role,'note',e.note,'fromStatus',e.from_status,'toStatus',e.to_status,'createdAt',e.created_at) ORDER BY e.created_at) FROM request_events e JOIN users a ON a.id=e.actor_user_id WHERE e.request_id=r.id),'[]'::json) AS events
     FROM hr_requests r JOIN users u ON u.id=r.user_id WHERE r.organization_id=$1 AND ($2 IN ('hr','admin') OR r.user_id=$3) AND ($2 NOT IN ('hr','admin') OR r.status<>'draft') ORDER BY r.updated_at DESC LIMIT 100`,
    [user.organization_id, user.role, user.id],
  );
  return Response.json({ requests: rows });
}
export async function POST(request: Request) {
  const { user, response } = await requireUser(["employee"]);
  if (!user) return response;
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  let body;
  try {
    body = schema.safeParse(await readJson(request));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "Request body must be JSON.");
  }
  if (!body.success)
    return jsonError(
      400,
      "INVALID_INPUT",
      "Check the request fields and try again.",
    );
  const { category, subject, description, submit } = body.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const status = submit ? "submitted" : "draft";
    const row = (
      await client.query<{ id: string }>(
        "INSERT INTO hr_requests(user_id,organization_id,category,subject,description,status,submitted_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='submitted' THEN now() END) RETURNING id",
        [user.id, user.organization_id, category, subject, description, status],
      )
    ).rows[0];
    if (submit) {
      await client.query(
        "INSERT INTO request_events(request_id,actor_user_id,from_status,to_status) VALUES($1,$2,'draft','submitted')",
        [row.id, user.id],
      );
      await client.query(
        "INSERT INTO audit_events(actor_user_id,organization_id,action,entity_type,entity_id) VALUES($1,$2,'request.submitted','hr_request',$3)",
        [user.id, user.organization_id, row.id],
      );
    }
    await client.query("COMMIT");
    return Response.json({ id: row.id, status }, { status: 201 });
  } catch {
    await client.query("ROLLBACK");
    return jsonError(500, "SAVE_FAILED", "Request could not be saved.");
  } finally {
    client.release();
  }
}
