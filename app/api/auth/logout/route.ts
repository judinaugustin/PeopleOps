import { destroySession, enforceSameOrigin } from "@/lib/security";
export async function POST(request: Request) {
  if (!(await enforceSameOrigin(request)))
    return Response.json(
      { error: { code: "ORIGIN", message: "Request rejected." } },
      { status: 403 },
    );
  await destroySession();
  return Response.json({ ok: true });
}
