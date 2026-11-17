import { confirmAction } from "./forms.js";

// Sandbox for the public demo. There is no server: this module plays the part
// of routes/api.js inside the visitor's browser. It runs the real app's
// validation, pay and summary code (lib/*.js, copied unchanged into the demo
// build) against records kept in sessionStorage. It starts blank: two generic
// jobs and a goal, and everything else is what the visitor adds.
const enabled = () => document.documentElement.dataset.demo === "true";
const STORAGE_KEY = "shiftlog-sandbox-blank";
let ready; // Promise of { lib, store }, created on the first request.

// Loaded only in the demo, so the full app never requests these files.
async function loadLib() {
  const [validation, pay, data, demo, planning] = await Promise.all([
    import("../lib/validation.js"),
    import("../lib/pay.js"),
    import("../lib/data.js"),
    import("../lib/demo-data.js"),
    import("../lib/planning.js"),
  ]);
  return { ...validation, ...pay, ...data, ...demo, ...planning };
}

// Storage can be unavailable (private mode, blocked site data); the demo then
// still works, it just forgets changes on refresh.
function readStore() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Fall through to a blank sandbox.
  }
  return null;
}
function save(store) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Changes stay in memory for this page view only.
  }
}

function sandbox() {
  ready ||= loadLib().then((lib) => {
    const store = readStore() || lib.createBlankDemo();
    save(store);
    return { lib, store };
  });
  return ready;
}

export function resetDemo() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  ready = null;
}

// Replaces the sandbox's shifts and expenses with four weeks of examples.
// Jobs the visitor added and the savings goal stay as they are.
export async function loadSampleData() {
  const { lib, store } = await sandbox();
  // A JSON round-trip stores dates as ISO strings, like JSON from the API.
  const sample = JSON.parse(
    JSON.stringify(lib.createSampleData(store.rates, new Date())),
  );
  store.shifts = sample.shifts;
  store.transactions = sample.transactions;
  save(store);
}

const nextId = (rows) => Math.max(0, ...rows.map((row) => row.id)) + 1;

export async function demoApi(path, options = {}) {
  const { lib, store } = await sandbox();
  const method = (options.method || "GET").toUpperCase();
  const body = options.body || {};
  const url = new URL(path, "https://demo.invalid");
  const query = Object.fromEntries(url.searchParams);
  const [, resource, rawId] = url.pathname.split("/");
  const summary = (transactions = store.transactions) =>
    lib.summarize(
      {
        shifts: store.shifts,
        transactions,
        goal: store.goal,
        paychecks: store.paychecks,
      },
      new Date(),
    );

  if (method === "GET") {
    if (resource === "dashboard") return summary();
    if (resource === "jobs") return store.jobs;
    if (resource === "pay-rates") return store.rates;
    if (resource === "shifts")
      return lib.filterRecords(store.shifts, query, "clock_in");
    if (resource === "transactions")
      return lib.filterRecords(store.transactions, query, "date");
  }

  if (resource === "shifts") {
    const key = rawId ? lib.id(rawId) : null;
    const old = key && store.shifts.find((s) => s.id === key);
    if (key) lib.check(old, "Shift not found.", 404);
    if (method === "DELETE") {
      store.shifts = store.shifts.filter((s) => s.id !== key);
      return finish(store, null);
    }
    // Same steps as POST/PATCH /api/shifts: validate, check the job and
    // overlaps, then calculate pay with the job's pay rates.
    const s = lib.shiftInput(old ? { ...old, ...body } : body);
    const job = store.jobs.find((j) => j.id === s.job_id);
    lib.check(job, "Job not found.", 404);
    lib.rejectOverlap(
      store.shifts.some((other) => other.id !== key && lib.overlaps(s, other)),
    );
    const row = JSON.parse(
      JSON.stringify({
        source: "manual",
        ...old,
        ...s,
        id: key || nextId(store.shifts),
        job_name: job.name,
        ...lib.calculatePay(s, store.rates),
      }),
    );
    store.shifts = [row, ...store.shifts.filter((x) => x.id !== key)].sort(
      (a, b) => b.clock_in.localeCompare(a.clock_in),
    );
    return finish(store, row);
  }

  if (resource === "transactions") {
    const key = rawId ? lib.id(rawId) : null;
    const old = key && store.transactions.find((t) => t.id === key);
    if (key) lib.check(old, "Transaction not found.", 404);
    let next = store.transactions.filter((t) => t.id !== key);
    let row = null;
    if (method !== "DELETE") {
      row = {
        id: key || nextId(store.transactions),
        ...lib.transactionInput(old ? { ...old, ...body } : body),
      };
      next = [row, ...next].sort(
        (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
      );
    }
    // Like the API's database transaction: check first, then keep the change.
    lib.rejectNegativeSavings(summary(next).saved);
    store.transactions = next;
    return finish(store, row);
  }

  // Same steps as POST /api/jobs: validate, reject a duplicate name, then
  // add the job with one pay rule covering all tracked history.
  if (resource === "jobs" && method === "POST" && !rawId) {
    const j = lib.jobInput(body);
    lib.rejectDuplicateJob(
      store.jobs.some((job) => job.name.toLowerCase() === j.name.toLowerCase()),
    );
    const job = { id: nextId(store.jobs), name: j.name };
    store.jobs.push(job);
    store.rates.push({
      id: nextId(store.rates),
      job_id: job.id,
      effective_from: lib.HISTORY_START,
      base_rate: j.base_rate,
      premium_rate: j.premium_rate,
      premium_start: j.premium_start,
      premium_end: j.premium_end,
    });
    return finish(store, job);
  }

  if (resource === "savings-goal" && method === "PUT") {
    store.goal = lib.amount(body.amount);
    return finish(store, { id: 1, amount: store.goal });
  }

  throw new Error(
    "Paychecks and pay rates are read-only in this demo. Try shifts, expenses, savings, or adding a job.",
  );
}

function finish(store, result) {
  save(store);
  return result;
}

export function applyDemoControls(root) {
  if (!enabled()) return;
  if (!document.querySelector("#demo-banner")) {
    const banner = document.createElement("div");
    banner.id = "demo-banner";
    banner.className = "demo-banner";
    banner.innerHTML =
      '<span>Sandbox demo: start by logging a shift. Your changes stay in your browser.</span><span class="demo-actions"><button type="button" class="btn-link" id="load-sample">Load sample data</button><button type="button" class="btn btn-sm" id="reset-demo">Reset demo</button></span>';
    document.querySelector(".topbar").after(banner);
    document.querySelector(".sidebar-bottom strong").textContent =
      "Sandbox demo";
    // app.js re-renders the current page on hashchange.
    const refresh = () =>
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    banner.querySelector("#reset-demo").onclick = () => {
      resetDemo();
      refresh();
    };
    banner.querySelector("#load-sample").onclick = () =>
      confirmAction(
        "Load sample data?",
        "This replaces the shifts and expenses in this sandbox with four weeks of examples for Day job and Night job.",
        loadSampleData,
        refresh,
        "Load sample data",
      );
  }
  // Paychecks and pay rates stay read-only in the sandbox.
  root
    .querySelectorAll(
      '[data-action$="-paycheck"], [data-action="load-rate"], #rate-form button, #rate-form input, #rate-form select',
    )
    .forEach((control) => {
      control.disabled = true;
      control.title = "Read-only in this demo.";
    });
}
