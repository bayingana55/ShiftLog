import moment from "moment-timezone";
export const HISTORY_START = "2026-01-01";
export const BUDGET_CATEGORIES = [
  "Rent",
  "Groceries",
  "Bills",
  "Clothes & Going Out",
];
export function trackedMonths(through) {
  const months = [];
  for (
    let month = HISTORY_START;
    month <= through;
    month = moment.utc(month).add(1, "month").format("YYYY-MM-DD")
  )
    months.push(month.slice(0, 7));
  return months;
}
export function budgetForMonth(rates, month) {
  const categories = [
    ...new Set([...BUDGET_CATEGORIES, ...rates.map((r) => r.category)]),
  ];
  return categories
    .map((category) => {
      const rule = rates
        .filter(
          (r) =>
            r.category === category && r.effective_from.slice(0, 7) <= month,
        )
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
      return { category, amount: Number(rule?.amount || 0) };
    })
    .filter((item) => item.amount > 0);
}
