import { z } from "zod";
import { query } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
const schema = z.object({
  messageId: z.string().uuid(),
  rating: z.enum(["helpful", "not_helpful"]),
  category: z.string().max(50).optional(),
});
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  let parsed;
  try {
    parsed = schema.safeParse(await readJson(request));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "Send valid feedback.");
  }
  if (!parsed.success)
    return jsonError(400, "INVALID_INPUT", "Invalid feedback.");
  const accessible = await query(
    "SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.user_id=$2 AND m.role='assistant'",
    [parsed.data.messageId, user.id],
  );
  if (!accessible.rowCount)
    return jsonError(404, "NOT_FOUND", "Message not found.");
  await query(
    "INSERT INTO feedback(message_id,user_id,rating,category) VALUES($1,$2,$3,$4) ON CONFLICT(message_id,user_id) DO UPDATE SET rating=EXCLUDED.rating,category=EXCLUDED.category",
    [
      parsed.data.messageId,
      user.id,
      parsed.data.rating,
      parsed.data.category ?? null,
    ],
  );
  return Response.json({ ok: true });
}
