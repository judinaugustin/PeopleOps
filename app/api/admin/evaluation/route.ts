import { query } from "@/lib/db";
import { requireUser } from "@/lib/security";
export async function GET() {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;
  const [docs, requests, answers, feedback] = await Promise.all([
    query(
      "SELECT status,count(*)::int AS count FROM documents WHERE organization_id=$1 GROUP BY status",
      [user.organization_id],
    ),
    query(
      "SELECT status,count(*)::int AS count FROM hr_requests WHERE organization_id=$1 GROUP BY status",
      [user.organization_id],
    ),
    query(
      "SELECT answer_status,count(*)::int AS count FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.organization_id=$1 AND m.role='assistant' GROUP BY answer_status",
      [user.organization_id],
    ),
    query(
      "SELECT rating,count(*)::int AS count FROM feedback f JOIN messages m ON m.id=f.message_id JOIN conversations c ON c.id=m.conversation_id WHERE c.organization_id=$1 GROUP BY rating",
      [user.organization_id],
    ),
  ]);
  return Response.json({
    generatedAt: new Date().toISOString(),
    mode: process.env.OPENAI_API_KEY ? "live" : "demo",
    documents: docs.rows,
    requests: requests.rows,
    answers: answers.rows,
    feedback: feedback.rows,
  });
}
