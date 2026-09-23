import {
  icon,
  escape,
  jobsOptions,
  localInput,
  today,
  categories,
  api,
  toast,
} from "./ui.js";
const modal = document.querySelector("#modal");
let previousFocus;
modal.addEventListener("close", () => previousFocus?.focus());
export function openModal(title, content, onSubmit) {
  modal.classList.remove("wide-dialog");
  previousFocus = document.activeElement;
  document.querySelector("#modal-content").innerHTML =
    `<div class="modal-head"><h2 id="modal-title">${escape(title)}</h2><button class="modal-close" type="button" aria-label="Close dialog">${icon("close")}</button></div>${content}`;
  modal.querySelector(".modal-close").onclick = () => modal.close();
  modal
    .querySelectorAll("[data-cancel]")
    .forEach((b) => (b.onclick = () => modal.close()));
  const form = modal.querySelector("form");
  if (form)
    form.onsubmit = async (event) => {
      event.preventDefault();
      const submit = form.querySelector("[type=submit]");
      submit.disabled = true;
      form.querySelector(".error-message")?.remove();
      try {
        await onSubmit(Object.fromEntries(new FormData(form)));
        modal.close();
      } catch (error) {
        const el = document.createElement("p");
        el.className = "error-message";
        el.setAttribute("role", "alert");
        el.textContent = error.message;
        form.prepend(el);
      } finally {
        submit.disabled = false;
      }
    };
  modal.showModal();
}
const actions = (label) =>
  `<div class="form-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">${label}</button></div>`;
export function shiftForm(jobs, shift, refresh) {
  const s = shift || {};
  openModal(
    shift ? "Edit shift" : "Log shift",
    `<form><div class="form-grid"><label class="full-width">Job<select name="job_id">${jobsOptions(jobs, s.job_id)}</select></label><label>Start date & time (Vancouver)<input name="clock_in" type="datetime-local" min="2026-01-01T00:00" value="${localInput(s.clock_in)}" required></label><label>End date & time (Vancouver)<input name="clock_out" type="datetime-local" value="${localInput(s.clock_out)}" required></label><label>Unpaid break (minutes)<input name="break_minutes" type="number" min="0" max="1440" step="1" value="${s.break_minutes || 0}" required></label><label>Break starts (optional)<input name="break_start" type="datetime-local" value="${localInput(s.break_start)}"></label><p class="form-note full-width">For an overnight shift, select the following day as the end date. Both dates and times are required. No break is assumed. Without an exact break start, break time is distributed proportionally across pay rates.</p></div>${actions("Save shift")}</form>`,
    async (data) => {
      await api(shift ? `/shifts/${shift.id}` : "/shifts", {
        method: shift ? "PATCH" : "POST",
        body: data,
      });
      toast("Shift saved.");
      await refresh();
    },
  );
}
export function transactionForm(transaction, refresh, savings = false) {
  const t = transaction || {
    type:
      savings === "withdrawal" ? "withdrawal" : savings ? "savings" : "expense",
    date: today(),
    category: "Other",
  };
  openModal(
    transaction
      ? "Edit transaction"
      : savings === "withdrawal"
        ? "Withdraw savings"
        : savings
          ? "Add savings"
          : "Add transaction",
    `<form><div class="form-grid"><label>Type<select name="type"><option value="expense" ${t.type === "expense" ? "selected" : ""}>Expense</option><option value="savings" ${t.type === "savings" ? "selected" : ""}>Savings deposit</option><option value="withdrawal" ${t.type === "withdrawal" ? "selected" : ""}>Savings withdrawal</option></select></label><label>Amount (CAD)<input name="amount" type="number" min="0.01" max="999999999" step="0.01" value="${escape(t.amount)}" required></label><label>Date<input name="date" type="date" min="2026-01-01" value="${t.date}" max="${today()}" required></label><label id="category-label">Category<select name="category">${categories.map((c) => `<option ${t.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></label><label class="full-width">Description<input name="description" maxlength="240" placeholder="What was it for?" value="${escape(t.description)}"></label><p class="form-note full-width">Deposits increase actual savings; withdrawals reduce it. Transfers out of savings are not expenses. Record a purchase separately if needed. All amounts are in Canadian dollars.</p></div>${actions("Save transaction")}</form>`,
    async (data) => {
      await api(
        transaction ? `/transactions/${transaction.id}` : "/transactions",
        { method: transaction ? "PATCH" : "POST", body: data },
      );
      toast("Transaction saved.");
      await refresh();
    },
  );
  const select = modal.querySelector("[name=type]");
  const update = () => {
    modal.querySelector("#category-label").hidden = select.value !== "expense";
  };
  select.onchange = update;
  update();
}
export function confirmAction(
  title,
  message,
  action,
  refresh,
  label = "Delete",
) {
  openModal(
    title,
    `<form><p>${escape(message)}</p>${actions(label)}</form>`,
    async () => {
      await action();
      toast(label === "Delete" ? "Record deleted." : "Changes saved.");
      await refresh();
    },
  );
}

export function paycheckForm(jobs, paycheck, refresh, defaults = {}) {
  const p = paycheck || {
    payday: defaults.payday || today(),
    job_id: defaults.job_id,
  };
  openModal(
    paycheck ? "Edit paycheck" : "Record paycheck",
    `<form><div class="form-grid"><label>Employer<select name="job_id">${jobsOptions(jobs, p.job_id)}</select></label><label>Payday<input type="date" name="payday" value="${p.payday}" min="2026-01-01" max="${today()}" required></label><label>Actual amount received (CAD)<input type="number" name="actual_amount" min="0" max="999999999" step="0.01" value="${escape(p.actual_amount)}" required></label><label>Gross amount on payslip (optional)<input type="number" name="gross_amount" min="0" max="999999999" step="0.01" value="${escape(p.gross_amount)}"></label><label>Work period start (optional)<input type="date" name="period_start" value="${escape(p.period_start)}"></label><label>Work period end (optional)<input type="date" name="period_end" value="${escape(p.period_end)}"></label><label class="full-width">Notes<input name="notes" maxlength="500" value="${escape(p.notes)}"></label><p class="form-note full-width">Enter the exact amount received. Leave unknown gross and work dates blank. A recorded zero means $0 was actually received; a missing record means unknown. Differences from gross are not classified as taxes.</p></div>${actions("Save paycheck")}</form>`,
    async (data) => {
      await api(paycheck ? `/paychecks/${paycheck.id}` : "/paychecks", {
        method: paycheck ? "PATCH" : "POST",
        body: data,
      });
      toast("Paycheck saved.");
      await refresh();
    },
  );
}
