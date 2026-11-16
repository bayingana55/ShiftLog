import { api, icon, escape, toast, zone } from "./ui.js";
import * as views from "./views.js";
import { renderCharts, destroyCharts } from "./charts.js";
import {
  shiftForm,
  transactionForm,
  paycheckForm,
  confirmAction,
} from "./forms.js";
import { applyDemoControls } from "./demo.js";
const main = document.querySelector("#main");
let state = {},
  currentPage = "",
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
      money: () => views.moneyPage(state),
      settings: () => views.settingsPage(state, jobs, rates),
    };
    main.innerHTML = pages[currentPage]();
    renderCharts(state);
    bindForms();
    applyDemoControls(main);
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
    const list = currentPage === "shifts" ? "shifts" : "transactions";
    const rows = await api(`/${list}?${params}`);
    document.querySelector("#filtered-results").innerHTML =
      currentPage === "shifts"
        ? views.shiftTable(rows)
        : views.transactionsTable(rows);
    applyDemoControls(main);
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
}
document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action,
    key = Number(target.dataset.id);
  try {
    if (action === "retry") return render();
    if (action === "withdraw-savings")
      return transactionForm(null, render, "withdrawal");

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
    if (action === "add-paycheck")
      return paycheckForm(state.jobs, null, render, {
        job_id: target.dataset.job,
        payday: target.dataset.payday,
      });
    if (action === "edit-paycheck")
      return paycheckForm(
        state.jobs,
        state.paychecks.find((p) => p.id === key),
        render,
      );
    if (action === "delete-paycheck")
      return confirmAction(
        "Delete this paycheck?",
        "This removes the recorded payment and updates actual cash flow. Shift earnings and savings deposits are unchanged.",
        () => api(`/paychecks/${key}`, { method: "DELETE" }),
        render,
      );
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
window.addEventListener("hashchange", render);
// Refresh records when returning from another tab.
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    !document.querySelector("#modal").open
  )
    render();
});
render();
