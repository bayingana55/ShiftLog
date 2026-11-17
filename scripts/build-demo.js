import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const output = new URL("../dist-demo/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(new URL("vendor/", output), { recursive: true });
await mkdir(new URL("lib/", output), { recursive: true });

// Explicit allowlist: no docs, screenshots, backups, environment files or database.
for (const directory of ["js", "css"])
  await cp(
    new URL(`../public/${directory}/`, import.meta.url),
    new URL(`${directory}/`, output),
    { recursive: true },
  );
// The sandbox runs the real app's rules in the browser, so it ships these
// lib files unchanged. They contain code only, never personal data.
for (const file of [
  "validation.js",
  "pay.js",
  "data.js",
  "time.js",
  "planning.js",
  "demo-data.js",
])
  await cp(
    new URL(`../lib/${file}`, import.meta.url),
    new URL(`lib/${file}`, output),
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
// lib/*.js import "moment-timezone" like any Node package. In the browser,
// the import map below points that name at this file, which re-exports the
// moment library the page already loads with a <script> tag.
await writeFile(
  new URL("vendor/moment-module.js", output),
  "export default window.moment;\n",
);
const importMap =
  '<script type="importmap">{"imports":{"moment-timezone":"./vendor/moment-module.js"}}</script>';
const html = (
  await readFile(new URL("../public/index.html", import.meta.url), "utf8")
)
  .replace('<html lang="en">', '<html lang="en" data-demo="true">')
  .replace('<link rel="stylesheet"', `${importMap}\n    <link rel="stylesheet"`)
  .replaceAll('href="/css/', 'href="./css/')
  .replaceAll('src="/vendor/', 'src="./vendor/')
  .replaceAll('src="/js/', 'src="./js/');
if (!html.includes('type="importmap"'))
  throw new Error("Could not add the import map to the demo page.");
await writeFile(new URL("index.html", output), html);
await writeFile(new URL(".nojekyll", output), "");
console.log(
  "Sandbox demo built in dist-demo (starts blank; sample data is generic).",
);
