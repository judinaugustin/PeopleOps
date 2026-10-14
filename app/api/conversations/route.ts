import { query } from "@/lib/db";
import { requireUser } from "@/lib/security";
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { rows } = await query(
    "SELECT c.id,c.title,c.updated_at,(SELECT count(*) FROM messages m WHERE m.conversation_id=c.id) AS message_count FROM conversations c WHERE c.user_id=$1 ORDER BY c.updated_at DESC LIMIT 50",
    [user.id],
  );
  return Response.json({ conversations: rows });
}
