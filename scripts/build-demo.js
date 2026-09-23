import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createDemoData } from "../lib/demo-data.js";

const output = new URL("../dist-demo/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(new URL("vendor/", output), { recursive: true });
// Explicit asset allowlist: no docs, screenshots, backups, environment files or database.
for (const directory of ["js", "css"])
  await cp(
    new URL(`../public/${directory}/`, import.meta.url),
    new URL(`${directory}/`, output),
    { recursive: true },
  );
for (const [source, destination] of [
  ["chart.js/dist/chart.umd.js", "chart.js"],
  ["moment/min/moment.min.js", "moment.js"],
  [
    "moment-timezone/builds/moment-timezone-with-data-1970-2030.min.js",
    "moment-timezone.js",
  ],
])
  await cp(
    new URL(`../node_modules/${source}`, import.meta.url),
    new URL(`vendor/${destination}`, output),
  );
const html = (
  await readFile(new URL("../public/index.html", import.meta.url), "utf8")
)
  .replace('<html lang="en">', '<html lang="en" data-demo="true">')
  .replaceAll('href="/css/', 'href="./css/')
  .replaceAll('src="/vendor/', 'src="./vendor/')
  .replaceAll('src="/js/', 'src="./js/');
await writeFile(new URL("index.html", output), html);
await writeFile(
  new URL("demo-data.json", output),
  JSON.stringify(createDemoData()),
);
await writeFile(new URL(".nojekyll", output), "");
console.log("Portfolio demo built in dist-demo with fictional data only.");
