import { api, icon, escape, toast, zone } from "./ui.js";
import * as views from "./views.js";
import { renderCharts, destroyCharts } from "./charts.js";
import {
  shiftForm,
  transactionForm,
  clockOutForm,
  confirmAction,
} from "./forms.js";
const main = document.querySelector("#main");
let state = {},
  currentPage = "",
  historyRange = null,
  requestVersion = 0;
const navigation = document.querySelector("#navigation");
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});
navigation.innerHTML = views.pages
  .map(
    ([id, label, symbol]) =>
      `<a href="#${id}" aria-label="${label}" title="${label}">${icon(symbol)}<span>${label}</span></a>`,
  )
  .join("");
async function render() {
  const version = ++requestVersion;
  currentPage = location.hash.slice(1) || "dashboard";
  if (!views.pages.some((p) => p[0] === currentPage)) {
    location.hash = "dashboard";
    return;
  }
  navigation.querySelectorAll("a").forEach((a) => {
    const active = a.hash === `#${currentPage}`;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const title = views.pages.find((p) => p[0] === currentPage)[1];
  document.querySelector("#breadcrumb").textContent = title;
  document.title = `${title} · ShiftLog`;
  destroyCharts();
  main.setAttribute("aria-busy", "true");
  main.innerHTML =
    '<div class="loading-state"><span class="spinner"></span>Loading your workspace…</div>';
  try {
    const [summary, jobs, shifts, transactions, rates] = await Promise.all([
      api("/dashboard"),
      api("/jobs"),
      api("/shifts"),
      api("/transactions"),
      api("/pay-rates"),
    ]);
    if (version !== requestVersion) return;
    state = {
      ...summary,
      jobs,
      all_shifts: shifts,
      all_transactions: transactions,
      rates,
    };
    const pages = {
      dashboard: () => views.dashboard(state, jobs),
      shifts: () => views.shiftsPage(state, jobs),
      transactions: () => views.transactionsPage(state),
      savings: () => views.savingsPage(state),
      earnings: () => views.earningsPage(state),
      analytics: () => views.analyticsPage(state),
      history: () => views.historyPage(),
      settings: () => views.settingsPage(state, jobs, rates),
    };
    main.innerHTML = pages[currentPage]();
    renderCharts(state);
    bindForms();
    updateElapsed();
  } catch (error) {
    if (version !== requestVersion) return;
    main.innerHTML = `<section class="card card-pad"><h1>Let’s reconnect.</h1><p class="error-message" role="alert">${escape(error.message)}</p><button class="btn btn-primary" data-action="retry">Try again</button></section>`;
  } finally {
    if (version === requestVersion) main.removeAttribute("aria-busy");
  }
}
function showFormError(form, error) {
  form.querySelector(".error-message")?.remove();
  const p = document.createElement("p");
  p.className = "error-message full-width";
  p.setAttribute("role", "alert");
  p.textContent = error.message;
  form.prepend(p);
}
function handleSubmit(id, action) {
  const form = document.getElementById(id);
  if (!form) return;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector(
      "button[type=submit], button:not([type])",
    );
    if (button) button.disabled = true;
    form.querySelector(".error-message")?.remove();
    try {
      await action(Object.fromEntries(new FormData(form)), form);
    } catch (e) {
      showFormError(form, e);
    } finally {
      if (button) button.disabled = false;
    }
  };
}
function bindForms() {
  handleSubmit("filter-form", async (data) => {
    const params = new URLSearchParams(
      Object.entries(data).filter(([, value]) => value),
    );
    const rows = await api(`/${currentPage}?${params}`);
    document.querySelector("#filtered-results").innerHTML =
      currentPage === "shifts"
        ? views.shiftTable(rows)
        : views.transactionsTable(rows);
  });
  handleSubmit("goal-form", async (data) => {
    await api("/savings-goal", { method: "PUT", body: data });
    toast("Savings goal updated.");
    await render();
  });
  handleSubmit("rate-form", async (data) => {
    for (const field of ["premium_start", "premium_end"]) {
      const [h, m] = data[field].split(":").map(Number);
      data[field] = h * 60 + m;
    }
    confirmAction(
      "Save this pay rule?",
      "Earnings will be recalculated from this effective date until the next configured rule.",
      () => api("/pay-rates", { method: "PUT", body: data }),
      render,
      "Save rule",
    );
  });
  handleSubmit("history-form", async (data) => {
    const rows = await api("/history/preview", { method: "POST", body: data });
    historyRange = data;
    document.querySelector("#history-results").innerHTML =
      views.historyResults(rows);
  });
  // A changed range invalidates its previous preview and selection.
  document.querySelector("#history-form")?.addEventListener("input", () => {
    historyRange = null;
    document.querySelector("#history-results").innerHTML =
      '<p class="muted">Dates changed. Preview again before importing.</p>';
  });
}
main.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action,
    key = Number(target.dataset.id);
  try {
    if (action === "retry") return render();
    if (action === "add-shift") return shiftForm(state.jobs, null, render);
    if (action === "edit-shift")
      return shiftForm(
        state.jobs,
        state.all_shifts.find((s) => s.id === key),
        render,
      );
    if (action === "delete-shift")
      return confirmAction(
        "Delete this shift?",
        "This permanently removes this shift and its earnings from your totals.",
        () => api(`/shifts/${key}`, { method: "DELETE" }),
        render,
      );
    if (action === "add-transaction" || action === "add-savings")
      return transactionForm(null, render, action === "add-savings");
    if (action === "edit-transaction")
      return transactionForm(
        state.all_transactions.find((t) => t.id === key),
        render,
      );
    if (action === "delete-transaction")
      return confirmAction(
        "Delete this transaction?",
        "This permanently removes the transaction and updates your spending or savings totals.",
        () => api(`/transactions/${key}`, { method: "DELETE" }),
        render,
      );
    if (action === "clock-in") {
      target.disabled = true;
      await api("/clock-in", {
        method: "POST",
        body: { job_id: document.querySelector("#clock-job").value },
      });
      toast("You’re on the clock.");
      return render();
    }
    if (action === "clock-out") return clockOutForm(state.active, render);
    if (action.startsWith("filter-")) {
      const form = document.querySelector("#filter-form");
      if (action === "filter-reset") form.reset();
      else {
        const now = window.moment().tz(zone);
        form.elements.from.value = now
          .clone()
          .startOf(action === "filter-week" ? "isoWeek" : "month")
          .format("YYYY-MM-DD");
        form.elements.to.value = now.format("YYYY-MM-DD");
      }
      form.requestSubmit();
    }
    if (action === "select-history") {
      const inputs = [
        ...document.querySelectorAll("[name=history-key]:not(:disabled)"),
      ];
      const select = inputs.some((i) => !i.checked);
      inputs.forEach((i) => (i.checked = select));
      target.textContent = select ? "Clear selection" : "Select available";
    }
    if (action === "import-history") {
      const keys = [
        ...document.querySelectorAll("[name=history-key]:checked"),
      ].map((i) => i.value);
      if (!keys.length) {
        toast("Select at least one shift you actually worked.");
        return;
      }
      if (!historyRange)
        throw new Error("Preview your selected date range again.");
      confirmAction(
        `Import ${keys.length} shifts?`,
        "Confirm these are dates you actually worked. Imported rows remain marked as schedule estimates; correct any exceptions in Shift history.",
        async () => {
          const result = await api("/history/import", {
            method: "POST",
            body: { ...historyRange, keys },
          });
          historyRange = { ...historyRange, result };
        },
        async () => {
          const result = historyRange.result;
          await render();
          toast(
            `Imported ${result.inserted} shifts; skipped ${result.skipped} existing or conflicting rows.`,
          );
        },
        "Import selected",
      );
    }
    if (action === "load-rate") {
      const r = state.rates.find((r) => r.id === key),
        form = document.querySelector("#rate-form");
      for (const field of [
        "job_id",
        "effective_from",
        "base_rate",
        "premium_rate",
      ])
        form.elements[field].value = r[field] ?? "";
      for (const field of ["premium_start", "premium_end"])
        form.elements[field].value =
          `${String(Math.floor(r[field] / 60)).padStart(2, "0")}:${String(r[field] % 60).padStart(2, "0")}`;
      form.elements.base_rate.focus();
    }
  } catch (error) {
    toast(error.message);
  } finally {
    target.disabled = false;
  }
});
function updateElapsed() {
  const el = document.querySelector("#elapsed");
  if (!el) return;
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(el.dataset.start)) / 1000),
  );
  el.textContent = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")} elapsed`;
}
setInterval(updateElapsed, 1000);
window.addEventListener("hashchange", render);
// Re-sync clock state after another tab changes it or this tab returns from sleep.
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    !document.querySelector("#modal").open
  )
    render();
});
render();
