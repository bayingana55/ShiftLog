import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pool from "./db.js";
import { api } from "./routes/api.js";

const root = path.dirname(fileURLToPath(import.meta.url));
export function createApp(db = pool) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    // A same-origin personal app: reject browser writes from other sites.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin && new URL(origin).host !== req.get("host"))
        return res
          .status(403)
          .json({ error: "Cross-origin writes are not allowed." });
      if (req.get("content-type")?.split(";")[0].trim() !== "application/json")
        return res.status(415).json({ error: "Send application/json." });
    }
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use(
    "/api",
    (req, res, next) => {
      if (
        ["POST", "PATCH", "PUT"].includes(req.method) &&
        (!req.body || Array.isArray(req.body) || typeof req.body !== "object")
      )
        return res.status(400).json({ error: "Send a JSON object." });
      next();
    },
    api(db),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.get("/vendor/chart.js", (req, res) =>
    res.sendFile(path.join(root, "node_modules/chart.js/dist/chart.umd.js")),
  );
  app.get("/vendor/moment.js", (req, res) =>
    res.sendFile(path.join(root, "node_modules/moment/min/moment.min.js")),
  );
  app.get("/vendor/moment-timezone.js", (req, res) =>
    res.sendFile(
      path.join(
        root,
        "node_modules/moment-timezone/builds/moment-timezone-with-data-1970-2030.min.js",
      ),
    ),
  );
  app.use(express.static(path.join(root, "public")));
  app.use((error, req, res, next) => {
    const status =
      error.status ||
      (error.code === "23505"
        ? 409
        : error.code === "23503"
          ? 404
          : error.code === "23514"
            ? 400
            : 500);
    if (status >= 500) console.error("Request failed:", error.message);
    const message =
      status >= 500
        ? "Database request failed. Check that PostgreSQL is running and migrations have been applied."
        : error.code === "23505"
          ? "A conflicting record already exists."
          : error.code === "23503"
            ? "Related record not found."
            : error.code === "23514"
              ? "This value violates a data constraint."
              : error.message;
    res.status(status).json({ error: message });
  });
  return app;
}
const app = createApp();
const PORT = Number(process.env.PORT) || 3000;
// Importing the app for tests does not bind a port. Listening remains after all routes.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  app.listen(PORT, process.env.HOST || "127.0.0.1", () =>
    console.log(
      `ShiftLog running at http://${process.env.HOST || "127.0.0.1"}:${PORT}`,
    ),
  );
}
