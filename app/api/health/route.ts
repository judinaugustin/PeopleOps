import { pool } from "@/lib/db";
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({
      status: "ok",
      database: "ready",
      mode: process.env.OPENAI_API_KEY ? "live" : "demo",
    });
  } catch {
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503 },
    );
  }
}
