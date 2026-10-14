import { z } from "zod";
import { pool } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
import { canTransitionRequest } from "@/lib/workflows";
const schema = z.object({
  action: z.enum(["submit", "transition", "reply"]),
  status: z
    .enum(["in_review", "waiting_on_employee", "resolved", "closed"])
    .optional(),
  note: z.string().trim().max(1200).optional(),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { user, response } = await requireUser();
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
    return jsonError(400, "INVALID_INPUT", "Invalid request action.");
  const { requestId } = await params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      id: string;
      user_id: string;
      organization_id: string;
      status: string;
    }>(
      "SELECT id,user_id,organization_id,status FROM hr_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [requestId, user.organization_id],
    );
    const row = found.rows[0];
    if (!row || (user.role === "employee" && row.user_id !== user.id)) {
      await client.query("ROLLBACK");
      return jsonError(404, "NOT_FOUND", "Request not found.");
    }
    let target: string;
    if (body.data.action === "submit") {
      if (user.role !== "employee" || row.status !== "draft") {
        await client.query("ROLLBACK");
        return jsonError(
          403,
          "FORBIDDEN",
          "Only the owner can submit a draft request.",
        );
      }
      target = "submitted";
    } else if (body.data.action === "reply") {
      if (!body.data.note || body.data.note.length < 2) {
        await client.query("ROLLBACK");
        return jsonError(
          400,
          "REPLY_REQUIRED",
          "Write a reply before sending.",
        );
      }
      if (
        user.role === "employee" &&
        (row.user_id !== user.id || row.status !== "waiting_on_employee")
      ) {
        await client.query("ROLLBACK");
        return jsonError(
          409,
          "REPLY_NOT_EXPECTED",
          "A reply is available when HR requests more information.",
        );
      }
      target = user.role === "employee" ? "in_review" : row.status;
    } else {
      if (
        !["hr", "admin"].includes(user.role) ||
        !body.data.status ||
        !canTransitionRequest(row.status, body.data.status)
      ) {
        await client.query("ROLLBACK");
        return jsonError(
          409,
          "INVALID_TRANSITION",
          "That status change is not allowed.",
        );
      }
      target = body.data.status;
      if (!body.data.note || body.data.note.length < 2) {
        await client.query("ROLLBACK");
        return jsonError(
          400,
          "RESPONSE_REQUIRED",
          "Add a response before changing the request status.",
        );
      }
    }
    if (target !== row.status || body.data.action === "reply")
      await client.query(
        "UPDATE hr_requests SET status=$2,submitted_at=CASE WHEN $2='submitted' THEN now() ELSE submitted_at END,resolved_at=CASE WHEN $2='resolved' THEN now() ELSE resolved_at END,updated_at=now() WHERE id=$1",
        [row.id, target],
      );
    await client.query(
      "INSERT INTO request_events(request_id,actor_user_id,from_status,to_status,note) VALUES($1,$2,$3,$4,$5)",
      [row.id, user.id, row.status, target, body.data.note ?? null],
    );
    await client.query(
      "INSERT INTO audit_events(actor_user_id,organization_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'hr_request',$4,$5)",
      [
        user.id,
        user.organization_id,
        body.data.action === "reply" ? "request.replied" : `request.${target}`,
        row.id,
        JSON.stringify({
          from: row.status,
          to: target,
          action: body.data.action,
        }),
      ],
    );
    await client.query("COMMIT");
    return Response.json({ id: row.id, status: target });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return jsonError(
      500,
      "UPDATE_FAILED",
      "Request status could not be updated.",
    );
  } finally {
    client.release();
  }
}
