import { z } from "zod";
import { pool, query } from "@/lib/db";
import { answerQuestion, retrieve } from "@/lib/ai";
import { cleanString, jsonError, readJson } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
const schema = z.object({
  question: z.string().trim().min(3).max(1200),
  conversationId: z.string().uuid().optional(),
});
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  let body;
  try {
    body = schema.safeParse(await readJson(request));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "Send a small JSON question.");
  }
  if (!body.success)
    return jsonError(
      400,
      "INVALID_INPUT",
      "Question must be 3 to 1,200 characters.",
    );
  const question = body.data.question;
  const count = await query<{ count: string }>(
    "SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='user' AND m.created_at>now()-interval '1 hour'",
    [user.id],
  );
  if (
    Number(count.rows[0]?.count ?? 0) >=
    Number(process.env.MAX_QUESTIONS_PER_HOUR ?? 30)
  )
    return jsonError(
      429,
      "RATE_LIMIT",
      "You have reached the hourly demo question limit.",
    );
  const conversationId = body.data.conversationId;
  if (conversationId) {
    const owned = await query(
      "SELECT id FROM conversations WHERE id=$1 AND user_id=$2",
      [conversationId, user.id],
    );
    if (!owned.rowCount)
      return jsonError(404, "NOT_FOUND", "Conversation not found.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cid =
      conversationId ??
      (
        await client.query<{ id: string }>(
          "INSERT INTO conversations(user_id,organization_id,title) VALUES($1,$2,$3) RETURNING id",
          [user.id, user.organization_id, cleanString(question, 72)],
        )
      ).rows[0].id;
    if (conversationId)
      await client.query(
        "UPDATE conversations SET updated_at=now() WHERE id=$1",
        [cid],
      );
    await client.query(
      "INSERT INTO messages(conversation_id,role,content) VALUES($1,'user',$2)",
      [cid, question],
    );
    await client.query("COMMIT");
    const start = Date.now();
    const { chunks, mode } = await retrieve(
      question,
      user.organization_id,
      user.role,
    );
    const result = await answerQuestion(question, chunks);
    const saved = await client.query<{ id: string }>(
      "INSERT INTO messages(conversation_id,role,content,answer_status,model,input_tokens,output_tokens,latency_ms) VALUES($1,'assistant',$2,$3,$4,$5,$6,$7) RETURNING id",
      [
        cid,
        result.answer,
        result.status,
        result.model,
        result.usage?.prompt_tokens ?? null,
        result.usage?.completion_tokens ?? null,
        Date.now() - start,
      ],
    );
    for (const [index, citation] of result.citations.entries())
      await client.query(
        "INSERT INTO message_citations(message_id,chunk_id,display_order) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [saved.rows[0].id, citation.id, index],
      );
    return Response.json({
      conversationId: cid,
      messageId: saved.rows[0].id,
      answer: result.answer,
      status: result.status,
      mode,
      evidenceCount: chunks.length,
      citations: result.citations.map((c) => ({
        id: c.id,
        documentId: c.document_id,
        title: c.title,
        version: c.version_label,
        effectiveFrom: c.effective_from,
        quote: c.content.slice(0, 500),
      })),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "AI chat request failed:",
      error instanceof Error
        ? error.message
        : "unknown provider or retrieval error",
    );
    return jsonError(
      503,
      "CHAT_UNAVAILABLE",
      "The assistant could not complete this request. Try again or contact People Operations.",
    );
  } finally {
    client.release();
  }
}
