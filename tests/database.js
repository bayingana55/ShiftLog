import "dotenv/config";
import pg from "pg";
import { migrate } from "../scripts/migrate.js";
export async function isolatedDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error(
      "Set TEST_DATABASE_URL to a dedicated database whose name ends in _test.",
    );
  const schema = `test_${process.pid}_${Date.now()}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
  });
  try {
    await migrate(db);
  } catch (e) {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    throw e;
  }
  return {
    db,
    async cleanup() {
      await db.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
