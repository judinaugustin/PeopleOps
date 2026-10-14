import { z } from "zod";
import { query } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { enforceSameOrigin, requireUser } from "@/lib/security";
const schema = z.object({
  title: z.string().trim().min(3).max(120),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        done: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(30),
});
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { rows } = await query(
    "SELECT id,title,status,items,created_at,updated_at FROM checklists WHERE user_id=$1 ORDER BY updated_at DESC",
    [user.id],
  );
  return Response.json({ checklists: rows });
}
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  let parsed;
  try {
    parsed = schema.safeParse(await readJson(request));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "Send a small JSON checklist.");
  }
  if (!parsed.success)
    return jsonError(
      400,
      "INVALID_INPUT",
      "Check the checklist title and items.",
    );
  const { rows } = await query<{ id: string }>(
    "INSERT INTO checklists(user_id,organization_id,title,items) VALUES($1,$2,$3,$4) RETURNING id",
    [
      user.id,
      user.organization_id,
      parsed.data.title,
      JSON.stringify(parsed.data.items),
    ],
  );
  return Response.json({ id: rows[0].id, status: "draft" }, { status: 201 });
}
