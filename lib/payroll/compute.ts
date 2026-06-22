// Pure payroll maths, mirrored from the source workbooks. No React / storage here
// so the formulas can be unit-tested in isolation (see tests/payroll.test.ts).
import {
  NAPSA_RATE,
  type DismissalPay,
  type PayrollRun,
  type PayrollRunRow,
  type PieceworkBasis,
  type PieceworkSheet,
  type PieceworkWorker,
} from "./types";

/** Round to 2 dp, killing binary-float noise (e.g. 0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Kwacha display: "K1,200" or "K1,234.50". */
export function kwacha(n: number): string {
  const v = round2(n);
  return (
    "K" +
    v.toLocaleString("en-ZM", {
      minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

export function sum(ns: number[]): number {
  return round2(ns.reduce((a, b) => a + (Number(b) || 0), 0));
}

// ── NAPSA ────────────────────────────────────────────────────────────────────
// Sheet: 5% from worker, the employer matches it, total goes to NAPSA, and the
// payslip shows basic less the worker's 5%.
export interface NapsaResult {
  employeeShare: number;
  employerShare: number;
  totalToNapsa: number;
  balanceForPayslip: number;
}
export function napsaFor(basicPay: number, rate: number = NAPSA_RATE): NapsaResult {
  const employeeShare = round2((Number(basicPay) || 0) * rate);
  const employerShare = employeeShare; // employer matches the worker's contribution
  return {
    employeeShare,
    employerShare,
    totalToNapsa: round2(employeeShare + employerShare),
    balanceForPayslip: round2((Number(basicPay) || 0) - employeeShare),
  };
}

// ── Payslip ───────────────────────────────────────────────────────────────────
export interface PayslipResult {
  gross: number;
  totalDeductions: number;
  net: number;
}
export function payslipTotals(
  earnings: number[],
  deductions: number[],
): PayslipResult {
  const gross = sum(earnings);
  const totalDeductions = sum(deductions);
  return { gross, totalDeductions, net: round2(gross - totalDeductions) };
}

// ── Monthly payroll register (August 2022 layout) ────────────────────────────
// income      = rate + overtime + piecework
// absentDeduct = rate / workingDays × absentDays           (prorated absence)
// owed         = absentDeduct + advance + balBf + zesco + other
// recovered    = owed × recoveryRate                       (40% cap in August)
// balCf        = owed − recovered                          (carried to next month)
// net          = income − recovered
export interface PayrollRowResult {
  income: number;
  absentDeduct: number;
  owed: number;
  recovered: number;
  balCf: number;
  net: number;
}
export function payrollRow(
  row: PayrollRunRow,
  workingDays: number,
  recoveryRate: number,
): PayrollRowResult {
  const income = sum([row.rate, row.overtime, row.piecework]);
  const days = workingDays > 0 ? workingDays : 1;
  const absentDeduct = round2(((Number(row.rate) || 0) / days) * (Number(row.absentDays) || 0));
  const owed = sum([absentDeduct, row.advance, row.balBf, row.zesco, row.other]);
  const recovered = round2(owed * recoveryRate);
  return {
    income,
    absentDeduct,
    owed,
    recovered,
    balCf: round2(owed - recovered),
    net: round2(income - recovered),
  };
}

export interface PayrollTotals {
  income: number;
  recovered: number;
  net: number;
  balCf: number;
}
export function payrollTotals(run: PayrollRun): PayrollTotals {
  const results = run.rows.map((r) => payrollRow(r, run.workingDays, run.recoveryRate));
  return {
    income: sum(results.map((r) => r.income)),
    recovered: sum(results.map((r) => r.recovered)),
    net: sum(results.map((r) => r.net)),
    balCf: sum(results.map((r) => r.balCf)),
  };
}

// ── Leave ledger ──────────────────────────────────────────────────────────────
// balance   = allocated − Σ(days taken)
// taken     = allocated − balance  (i.e. Σ days taken)
// amount    = dayRate × taken
export interface LeaveResult {
  balance: number;
  totalTaken: number;
  amount: number;
}
export function leaveFor(
  allocated: number,
  taken: number[],
  dayRate: number,
): LeaveResult {
  const totalTaken = sum(taken);
  return {
    balance: round2((Number(allocated) || 0) - totalTaken),
    totalTaken,
    amount: round2(dayRate * totalTaken),
  };
}

// ── Casual / piece-work rate ──────────────────────────────────────────────────
export function pieceworkAmount(
  worker: Pick<PieceworkWorker, "days" | "basis">,
  sheet: Pick<PieceworkSheet, "rate30" | "ratePerDay" | "ratePerHalfDay">,
): number {
  const days = Number(worker.days) || 0;
  const rate = pieceworkUnitRate(worker.basis, sheet);
  return round2(days * rate);
}
export function pieceworkUnitRate(
  basis: PieceworkBasis,
  sheet: Pick<PieceworkSheet, "rate30" | "ratePerDay" | "ratePerHalfDay">,
): number {
  switch (basis) {
    case "month":
      // Left unrounded on purpose: rounding the daily rate before multiplying by
      // days would drift (33.33 × 30 = 999.9). pieceworkAmount rounds the total.
      return (Number(sheet.rate30) || 0) / 30;
    case "halfday":
      return Number(sheet.ratePerHalfDay) || 0;
    case "day":
    default:
      return Number(sheet.ratePerDay) || 0;
  }
}

// ── Dismissal / terminal pay ──────────────────────────────────────────────────
// net = (Σ unpaid dues + Σ leave-day pay + Σ benefits) − Σ deductions
export interface DismissalResult {
  dues: number;
  leave: number;
  benefits: number;
  deductions: number;
  net: number;
}
export function dismissalTotals(d: DismissalPay): DismissalResult {
  const dues = sum(d.dues.map((l) => l.amount));
  const leave = sum(d.leaveDays.map((l) => l.amount));
  const benefits = sum(d.benefits.map((l) => l.amount));
  const deductions = sum(d.deductions.map((l) => l.amount));
  return {
    dues,
    leave,
    benefits,
    deductions,
    net: round2(dues + leave + benefits - deductions),
  };
}
