import { createApp } from "../server.js";
import pool from "../db.js";
import { HISTORY_START, HISTORY_END } from "../lib/planning.js";
// Reuse the API's locked, validated importer rather than a separate SQL insertion path.
const server = createApp(pool).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/history`;
async function request(route, body) {
  const response = await fetch(`${base}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
try {
  const range = { from: HISTORY_START, to: HISTORY_END };
  const candidates = await request("preview", range);
  console.log("Schedule preview:", {
    from: range.from,
    through: range.to,
    total: candidates.length,
    ready: candidates.filter((s) => s.status === "ready").length,
    existing: candidates.filter((s) => s.status === "existing").length,
    conflicts: candidates.filter((s) => s.status === "conflict").length,
  });
  if (process.argv.includes("--apply"))
    console.log(
      "Import result:",
      await request("import", {
        ...range,
        keys: candidates.map((s) => s.history_key),
      }),
    );
  else
    console.log(
      "No changes made. Run npm run history:import to insert the reviewed schedule.",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
