import { openModal } from "./forms.js";
import { api, escape, money, toast } from "./ui.js";
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
