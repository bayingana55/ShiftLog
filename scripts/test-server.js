import { isolatedDatabase } from "../tests/database.js";
import { createApp } from "../server.js";
const { db, cleanup } = await isolatedDatabase();
const server = createApp(db).listen(3101, "127.0.0.1", () =>
  console.log("Isolated browser test server ready."),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await cleanup();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
