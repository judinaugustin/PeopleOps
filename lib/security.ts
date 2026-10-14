import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { query } from "@/lib/db";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "peopleops_session";
const SESSION_DAYS = 7;
export type User = {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: "employee" | "hr" | "admin";
};

export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: key.toString("hex") };
}
export async function verifyPassword(
  password: string,
  salt: string,
  expected: string,
) {
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const known = Buffer.from(expected, "hex");
  return known.length === actual.length && timingSafeEqual(actual, known);
}
const tokenHash = (token: string) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(token).digest("hex");
};

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)",
    [userId, tokenHash(token), expires],
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.COOKIE_SECURE !== "false",
    path: "/",
    expires,
  });
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await query<User & { expires_at: Date }>(
    `SELECT u.id,u.organization_id,u.email,u.name,u.role,s.expires_at FROM sessions s
     JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
}
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token)
    await query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
  jar.delete(SESSION_COOKIE);
}
export async function requireUser(roles?: User["role"][]) {
  const user = await currentUser();
  if (!user)
    return {
      user: null,
      response: Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401 },
      ),
    };
  if (roles && !roles.includes(user.role))
    return {
      user: null,
      response: Response.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You do not have access to this action.",
          },
        },
        { status: 403 },
      ),
    };
  return { user, response: null };
}
export async function enforceSameOrigin(request: Request) {
  const source = request.headers.get("origin");
  if (!source) return true;
  try {
    const sourceOrigin = new URL(source).origin;
    const allowedOrigins = [new URL(request.url).origin];
    const configuredBaseUrl = process.env.APP_BASE_URL;
    if (configuredBaseUrl)
      allowedOrigins.push(new URL(configuredBaseUrl).origin);
    return allowedOrigins.includes(sourceOrigin);
  } catch {
    return false;
  }
}
export async function requestId() {
  return (
    (await headers()).get("x-request-id") ?? randomBytes(8).toString("hex")
  );
}
