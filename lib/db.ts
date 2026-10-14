import { Pool } from "pg";

declare global {
  var peopleOpsPool: Pool | undefined;
}
export const pool =
  globalThis.peopleOpsPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  });
if (process.env.NODE_ENV !== "production") globalThis.peopleOpsPool = pool;

export async function query<
  T extends Record<string, unknown> = Record<string, unknown>,
>(sql: string, values: readonly unknown[] = []) {
  return pool.query<T>(sql, [...values]);
}
