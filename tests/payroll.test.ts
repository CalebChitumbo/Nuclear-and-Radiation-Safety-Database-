import { describe, expect, it } from "vitest";

import {
  dismissalTotals,
  leaveFor,
  napsaFor,
  payrollRow,
  payrollTotals,
  payslipTotals,
  pieceworkAmount,
  round2,
} from "../lib/payroll/compute";
import type { DismissalPay, PayrollRun, PayrollRunRow } from "../lib/payroll/types";

const row = (p: Partial<PayrollRunRow>): PayrollRunRow => ({
  id: "r",
  employeeId: null,
  name: "x",
  rate: 0,
  overtime: 0,
  piecework: 0,
  absentDays: 0,
  advance: 0,
  balBf: 0,
  zesco: 0,
  other: 0,
  ...p,
});

describe("napsaFor", () => {
  it("takes 5% from the worker and matches it from the employer", () => {
    const n = napsaFor(1000);
    expect(n.employeeShare).toBe(50);
    expect(n.employerShare).toBe(50);
    expect(n.totalToNapsa).toBe(100);
    // payslip shows basic less the worker's 5%
    expect(n.balanceForPayslip).toBe(950);
  });
});

describe("payslipTotals", () => {
  it("net = gross earnings − total deductions", () => {
    const t = payslipTotals([1000, 200, 0], [50, 100]);
    expect(t.gross).toBe(1200);
    expect(t.totalDeductions).toBe(150);
    expect(t.net).toBe(1050);
  });
});

describe("payrollRow (August 2022 model)", () => {
  it("prorates absence and caps recovery, carrying the rest forward", () => {
    const c = payrollRow(
      row({ rate: 2900, absentDays: 2, advance: 300, balBf: 400, zesco: 50, other: 50 }),
      29, // working days → absent deduct = (2900/29) * 2 = 200
      0.4, // recover 40% this month
    );
    expect(c.income).toBe(2900);
    expect(c.absentDeduct).toBe(200);
    expect(c.owed).toBe(1000); // 200 + 300 + 400 + 50 + 50
    expect(c.recovered).toBe(400); // 40% of 1000
    expect(c.balCf).toBe(600); // remainder carried forward
    expect(c.net).toBe(2500); // 2900 − 400
  });

  it("with a 100% recovery cap behaves like the simple monthly sheets", () => {
    // Jan 2022 — Vincent: gross 1200, ZESCO 50, net 1150
    const c = payrollRow(row({ rate: 1200, zesco: 50 }), 29, 1);
    expect(c.owed).toBe(50);
    expect(c.recovered).toBe(50);
    expect(c.balCf).toBe(0);
    expect(c.net).toBe(1150);
  });

  it("totals the register", () => {
    const run: PayrollRun = {
      id: "run",
      businessId: null,
      month: 1,
      year: 2022,
      workingDays: 29,
      recoveryRate: 1,
      createdAt: "",
      rows: [row({ rate: 1200, zesco: 50 }), row({ rate: 1000, other: 300, zesco: 50 })],
    };
    const t = payrollTotals(run);
    expect(t.income).toBe(2200);
    expect(t.recovered).toBe(400); // 50 + 350
    expect(t.net).toBe(1800); // 1150 + 650
  });
});

describe("leaveFor", () => {
  it("balance = allocated − taken, amount = dayRate × taken", () => {
    const l = leaveFor(24, [4, 2], 20);
    expect(l.totalTaken).toBe(6);
    expect(l.balance).toBe(18);
    expect(l.amount).toBe(120);
  });
});

describe("pieceworkAmount", () => {
  const rates = { rate30: 1000, ratePerDay: 35, ratePerHalfDay: 18 };
  it("multiplies days by the rate for the chosen basis", () => {
    expect(pieceworkAmount({ days: 10, basis: "day" }, rates)).toBe(350);
    expect(pieceworkAmount({ days: 5, basis: "halfday" }, rates)).toBe(90);
    expect(pieceworkAmount({ days: 30, basis: "month" }, rates)).toBe(1000);
  });
});

describe("dismissalTotals", () => {
  it("matches the worked William Mwalwanda example (net K3,320)", () => {
    const d: DismissalPay = {
      id: "d",
      name: "William Mwalwanda",
      businessId: null,
      dues: [950, 870, 750, 750, 750].map((amount, i) => ({ id: `a${i}`, amount })),
      leaveDays: [
        { id: "l1", amount: 1000 },
        { id: "l2", amount: 700 },
      ],
      benefits: [{ id: "b1", amount: 0 }],
      deductions: [{ id: "x1", amount: 2450 }],
      createdAt: "",
    };
    const t = dismissalTotals(d);
    expect(t.dues).toBe(4070);
    expect(t.leave).toBe(1700);
    expect(t.net).toBe(3320); // (4070 + 1700 + 0) − 2450
  });
});

describe("round2", () => {
  it("kills float noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
