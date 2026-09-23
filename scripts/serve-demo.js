import express from "express";
import { fileURLToPath } from "node:url";
const app = express();
app.use(
  "/ShiftLog",
  express.static(fileURLToPath(new URL("../dist-demo/", import.meta.url))),
);
app.listen(3102, "127.0.0.1", (error) => {
  if (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  console.log("Demo preview: http://127.0.0.1:3102/ShiftLog/");
});
