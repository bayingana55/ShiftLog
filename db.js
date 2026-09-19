import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  ...(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { database: "shiftlog" }),
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
pool.on("error", (error) =>
  console.error("Unexpected database connection error:", error.message),
);
export default pool;
