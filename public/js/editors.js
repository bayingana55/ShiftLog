import { openModal } from "./forms.js";
import { api, escape, money, toast } from "./ui.js";
import { transactionsTable, shiftTable } from "./views.js";
import { paycheckTable } from "./planning-views.js";
const actions = (label) =>
  `<div class="form-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">${label}</button></div>`;
export function goalEditor(state, refresh) {
  openModal(
    "Edit savings goal",
    `<form><label>Goal amount (CAD)<input name="amount" type="number" min="0.01" max="999999999" step="0.01" value="${state.goal}" required></label><p class="form-note mt-4">Changing your goal updates progress. It does not change your actual savings.</p>${actions("Save goal")}</form>`,
    async (body) => {
      await api("/savings-goal", { method: "PUT", body });
      toast("Savings goal updated.");
      await refresh();
    },
  );
}
export function balanceEditor(state, refresh) {
  openModal(
    "Set actual savings balance",
    `<form><p class="muted mb-4">Currently recorded: ${money(state.saved)}</p><label>Actual savings balance (CAD)<input name="amount" type="number" min="0" max="999999999" step="0.01" value="${state.saved}" required></label><p class="form-note mt-4">Enter the amount you actually have saved, including zero. Saving records the difference as a deposit or withdrawal dated today. You can edit or delete that adjustment in Savings history. Projected savings does not change.</p>${actions("Save balance")}</form>`,
    async (body) => {
      await api("/savings-balance", { method: "PUT", body });
      toast("Actual savings balance updated.");
      await refresh();
    },
  );
}
export function recordsEditor(kind, state) {
  const configs = {
    expenses: {
      title: "Manage actual expenses",
      action: "add-transaction",
      label: "Add expense",
      note: "Add a purchase, correct an amount, or delete a mistaken entry. The total updates automatically.",
    },
    savings: {
      title: "Savings history",
      action: "add-savings",
      label: "Add savings",
      note: "Deposits increase your savings; withdrawals reduce it. Edit or delete an entry to correct a mistake.",
    },
    paychecks: {
      title: "Manage paychecks",
      action: "add-paycheck",
      label: "Record paycheck",
      note: "Record or correct the exact money received. Missing amounts stay unknown.",
    },
    shifts: {
      title: "Manage shifts",
      action: "add-shift",
      label: "Log shift",
      note: "Edit or delete the work entries behind your hours and gross earnings.",
    },
  };
  const config = configs[kind];
  openModal(
    config.title,
    `<p class="form-note mb-4">${config.note}</p><div class="manager-toolbar"><button class="btn btn-primary" data-action="${config.action}">${config.label}</button>${kind === "savings" ? '<button class="btn" data-action="withdraw-savings">Withdraw savings</button><button class="btn" data-action="set-savings">Set balance</button>' : ""}</div><label class="mt-4">Search records<input type="search" id="record-search" placeholder="Search date, description, or employer"></label><div id="managed-records" class="mt-4"></div>`,
  );
  const modal = document.querySelector("#modal");
  modal.classList.add("wide-dialog");
  modal.addEventListener("close", () => modal.classList.remove("wide-dialog"), {
    once: true,
  });
  function draw() {
    const query = document.querySelector("#record-search").value.toLowerCase();
    const matches = (r) =>
      Object.values(r).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(query),
      );
    let html;
    if (kind === "shifts") html = shiftTable(state.all_shifts.filter(matches));
    else if (kind === "paychecks")
      html = paycheckTable({
        ...state,
        paychecks: state.paychecks.filter(matches),
      });
    else
      html = transactionsTable(
        state.all_transactions.filter(
          (t) =>
            (kind === "expenses"
              ? t.type === "expense"
              : ["savings", "withdrawal"].includes(t.type)) && matches(t),
        ),
      );
    document.querySelector("#managed-records").innerHTML = html;
  }
  document.querySelector("#record-search").addEventListener("input", draw);
  draw();
}
