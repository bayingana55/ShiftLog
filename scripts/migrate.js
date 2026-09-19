import { readFile } from "node:fs/promises";
import pool from "../db.js";
export async function migrate(db = pool) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(735100)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const migrations = [
      ["001", "001_shiftlog.sql"],
      ["002", "002_premium_end.sql"],
    ];
    for (const [version, file] of migrations) {
      const exists = await client.query(
        "SELECT version FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (!exists.rowCount) {
        await client.query(
          await readFile(new URL(`../sql/${file}`, import.meta.url), "utf8"),
        );
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES($1)",
          [version],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await migrate();
    console.log("ShiftLog migration complete; existing data preserved.");
  } catch (error) {
    console.error("Migration rolled back:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
