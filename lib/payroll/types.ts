// Payroll module data model. Self-contained from the radiation-safety register:
// these forms digitise the farm/shop payroll workbooks (Chitumbo Farm, Abitehcal
// Farm, Abitehcal Gardens / Health Shop, Flowbreeds Farm Shop) and persist to the
// browser (localStorage) exactly the way the app's mock register store does.

/** Statutory + house defaults, taken from the source spreadsheets. */
export const NAPSA_RATE = 0.05; // 5% employee, matched 5% by employer (sheet uses a flat 5%)
export const DEFAULT_WORKING_DAYS = 29; // August 2022 prorated absence as rate/29 × days
export const DEFAULT_RECOVERY_RATE = 0.4; // August 2022 caps monthly recovery at 40% of what's owed
export const DEFAULT_LEAVE_DAY_RATE = 20; // leave ledger: amount to pay = 20 × days taken

export const PAYROLL_BUSINESSES = [
  "Chitumbo Farm",
  "Abitehcal Farm",
  "Abitehcal Gardens / Health Shop",
  "Flowbreeds Farm Shop",
] as const;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface Business {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  businessId: string | null;
  name: string;
  nrc?: string;
  napsaNo?: string;
  position?: string;
  basicPay: number;
  dateEmployed?: string;
  leaveEntitled?: number;
  active: boolean;
}

/** One worker's line on a monthly payroll register (the August 2022 layout). */
export interface PayrollRunRow {
  id: string;
  employeeId: string | null;
  name: string;
  rate: number; // basic pay for the month
  overtime: number;
  piecework: number;
  absentDays: number;
  advance: number;
  balBf: number; // debt brought forward (last month's Bal C/F)
  zesco: number; // electricity recovery
  other: number;
}

export interface PayrollRun {
  id: string;
  businessId: string | null;
  month: number; // 1–12
  year: number;
  /** Days used to prorate an absence deduction (rate ÷ workingDays × absentDays). */
  workingDays: number;
  /** Share of what's owed actually recovered this month (0–1). 0.4 = the August cap. */
  recoveryRate: number;
  rows: PayrollRunRow[];
  createdAt: string;
}

export interface NapsaScheduleRow {
  id: string;
  employeeId: string | null;
  name: string;
  nrc?: string;
  napsaNo?: string;
  basicPay: number;
}

export interface NapsaSchedule {
  id: string;
  label: string;
  businessId: string | null;
  rate: number; // employee share; employer matches it
  rows: NapsaScheduleRow[];
}

export interface DebtEntry {
  id: string;
  date: string;
  amount: number;
  item?: string; // "amount/ item (amount equivalent)"
  purpose?: string;
  entered: boolean; // the "entered (tick)" column
}

export interface DebtLedger {
  id: string;
  employeeId: string | null;
  name: string;
  entries: DebtEntry[];
}

export interface AdvanceRequest {
  id: string;
  name: string;
  department?: string;
  date: string;
  amount: number;
  reason?: string;
  status: "pending" | "authorized" | "unauthorized";
  sign?: string;
  createdAt: string;
}

export type PieceworkBasis = "month" | "day" | "halfday";

export interface PieceworkWorker {
  id: string;
  name: string;
  dateEmployed?: string;
  dateEnded?: string;
  days: number;
  basis: PieceworkBasis;
}

export interface PieceworkSheet {
  id: string;
  businessId: string | null;
  title: string;
  rate30: number; // rate for 30 days
  ratePerDay: number;
  ratePerHalfDay: number;
  workers: PieceworkWorker[];
}

export interface LeaveLedgerRow {
  id: string;
  employeeId: string | null;
  name: string;
  allocated: number;
  taken: number[]; // one entry per spell of leave taken
}

export interface LeaveLedger {
  id: string;
  year: number;
  dayRate: number; // amount paid per day taken
  rows: LeaveLedgerRow[];
}

export interface LeaveApplication {
  id: string;
  surname: string;
  firstName: string;
  gender?: string;
  position?: string;
  daysEntitled: number;
  daysAsked: number;
  reason?: string;
  startDate?: string;
  employeeSign?: string;
  mdSign?: string;
  createdAt: string;
}

export interface StoresItem {
  id: string;
  itemCode?: string;
  description: string;
  qtyOrdered: number;
  qtyIssued: number;
}

export interface StoresRequisition {
  id: string;
  businessId: string | null;
  position?: string;
  no?: string;
  date?: string;
  items: StoresItem[];
  authorisedBy?: string;
  issuedBy?: string;
  receivedBy?: string;
  createdAt: string;
}

export interface StructureRow {
  id: string;
  role: string;
  salaryAmt: number;
  people: number;
  payGrade?: string;
}

export interface SalaryStructure {
  id: string;
  businessId: string | null;
  title: string;
  rows: StructureRow[];
}

export interface DismissalLine {
  id: string;
  label?: string;
  amount: number;
  desc?: string;
}

export interface DismissalPay {
  id: string;
  name: string;
  businessId: string | null;
  period?: string;
  dues: DismissalLine[]; // unpaid wages owed
  leaveDays: DismissalLine[]; // leave-day pay accrued
  benefits: DismissalLine[]; // gratuity / benefits accrued
  deductions: DismissalLine[]; // debts owed back
  notes?: string;
  createdAt: string;
}

export interface PayslipLine {
  label: string;
  amount: number;
}

export interface Payslip {
  id: string;
  template: "farm" | "healthshop";
  businessId: string | null;
  businessName: string;
  employeeId: string | null;
  employeeName: string;
  jobTitle?: string;
  department?: string;
  date?: string;
  payPeriod?: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  createdAt: string;
}

export interface PayrollSettings {
  napsaRate: number;
  workingDays: number;
  recoveryRate: number;
  leaveDayRate: number;
}

export interface PayrollState {
  businesses: Business[];
  employees: Employee[];
  payrollRuns: PayrollRun[];
  napsaSchedules: NapsaSchedule[];
  debtLedgers: DebtLedger[];
  advanceRequests: AdvanceRequest[];
  pieceworkSheets: PieceworkSheet[];
  leaveLedgers: LeaveLedger[];
  leaveApplications: LeaveApplication[];
  storesRequisitions: StoresRequisition[];
  salaryStructures: SalaryStructure[];
  dismissalPays: DismissalPay[];
  payslips: Payslip[];
  settings: PayrollSettings;
}
