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
    shift ? "Edit shift" : "Add a shift",
    `<form><div class="form-grid"><label class="full-width">Job<select name="job_id">${jobsOptions(jobs, s.job_id)}</select></label><label>Clock in (Vancouver)<input name="clock_in" type="datetime-local" value="${localInput(s.clock_in)}" required></label><label>Clock out (Vancouver)<input name="clock_out" type="datetime-local" value="${localInput(s.clock_out)}"></label><label>Unpaid break (minutes)<input name="break_minutes" type="number" min="0" max="1440" step="1" value="${s.break_minutes || 0}" required></label><label>Break starts (optional)<input name="break_start" type="datetime-local" value="${localInput(s.break_start)}"></label><p class="form-note full-width">For an overnight shift, select the following day for clock-out. Leave clock-out blank only for an active shift. No break is assumed. Without an exact break start, break time is distributed proportionally across pay rates.</p></div>${actions("Save shift")}</form>`,
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
    type: savings ? "savings" : "expense",
    date: today(),
    category: "Other",
  };
  openModal(
    transaction
      ? "Edit transaction"
      : savings
        ? "Add savings"
        : "Add transaction",
    `<form><div class="form-grid"><label>Type<select name="type"><option value="expense" ${t.type === "expense" ? "selected" : ""}>Expense</option><option value="savings" ${t.type === "savings" ? "selected" : ""}>Savings deposit</option></select></label><label>Amount (CAD)<input name="amount" type="number" min="0.01" max="999999999" step="0.01" value="${escape(t.amount)}" required></label><label>Date<input name="date" type="date" value="${t.date}" max="${today()}" required></label><label id="category-label">Category<select name="category">${categories.map((c) => `<option ${t.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></label><label class="full-width">Description<input name="description" maxlength="240" placeholder="What was it for?" value="${escape(t.description)}"></label><p class="form-note full-width">Savings deposits increase your savings goal progress. Expenses count toward spending. All amounts are in Canadian dollars.</p></div>${actions("Save transaction")}</form>`,
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
    modal.querySelector("#category-label").hidden = select.value === "savings";
  };
  select.onchange = update;
  update();
}
export function clockOutForm(shift, refresh) {
  openModal(
    "Finish your shift",
    `<form><p class="muted mb-5">Clock out of ${escape(shift.job_name)} at the current time.</p><div class="form-grid"><label>Unpaid break (minutes)<input type="number" name="break_minutes" min="0" step="1" value="0" required></label><label>Break starts (optional)<input type="datetime-local" name="break_start"></label></div><p class="form-note mt-4">Enter the break you actually took. Home Depot commonly has 30 minutes; a 9-hour Apple shift commonly has 60 minutes.</p>${actions("Clock out")}</form>`,
    async (data) => {
      await api(`/shifts/${shift.id}/clock-out`, {
        method: "PATCH",
        body: data,
      });
      toast("Shift complete. Nice work.");
      await refresh();
    },
  );
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
