import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "@/lib/db";

async function main() {
  try {
    const sql = await readFile(resolve(process.cwd(), "db/schema.sql"), "utf8");
    await pool.query(sql);
    console.log("Database schema ready.");
  } catch (error) {
    console.error(
      "Database migration failed. Check DATABASE_URL and pgvector availability.",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
