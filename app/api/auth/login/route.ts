import { z } from "zod";
import { query } from "@/lib/db";
import {
  createSession,
  enforceSameOrigin,
  verifyPassword,
} from "@/lib/security";
import { jsonError, readJson } from "@/lib/http";
const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export async function POST(request: Request) {
  if (!(await enforceSameOrigin(request)))
    return jsonError(403, "ORIGIN", "Request rejected.");
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success)
      return jsonError(
        400,
        "INVALID_INPUT",
        "Enter a valid email and password.",
      );
    const email = body.data.email.trim().toLowerCase();
    const { rows } = await query<{
      id: string;
      email: string;
      name: string;
      role: string;
      password_salt: string;
      password_hash: string;
      is_active: boolean;
    }>(
      "SELECT id,email,name,role,password_salt,password_hash,is_active FROM users WHERE email=$1",
      [email],
    );
    const user = rows[0];
    if (
      !user ||
      !user.is_active ||
      !(await verifyPassword(
        body.data.password,
        user.password_salt,
        user.password_hash,
      ))
    )
      return jsonError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    await createSession(user.id);
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (e) {
    if (
      e instanceof Error &&
      ["CONTENT_TYPE", "TOO_LARGE", "BAD_JSON"].includes(e.message)
    )
      return jsonError(
        400,
        "INVALID_REQUEST",
        "Request must be a small JSON object.",
      );
    return jsonError(
      500,
      "LOGIN_FAILED",
      "Sign-in is temporarily unavailable.",
    );
  }
}
