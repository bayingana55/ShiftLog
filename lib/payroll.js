// Future boundary: accept gross income, pay frequency, tax year and verified tables.
// Employer contributions need a separately specified definition and configuration.
export function estimatePayroll() {
  return {
    available: false,
    net_pay: null,
    reason:
      "Net pay unavailable. Verified payroll rules have not been configured.",
  };
}
