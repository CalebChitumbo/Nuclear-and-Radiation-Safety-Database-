// Seed mirrors the actual workbooks so the module opens already populated with
// real employees, NRC/NAPSA numbers, salary scales, piece-work rates and the four
// worked dismissal examples. Everything here is editable in-app once loaded.
import {
  DEFAULT_LEAVE_DAY_RATE,
  DEFAULT_RECOVERY_RATE,
  DEFAULT_WORKING_DAYS,
  NAPSA_RATE,
  type Business,
  type DismissalPay,
  type Employee,
  type LeaveLedger,
  type NapsaSchedule,
  type PayrollRun,
  type PayrollState,
  type PieceworkSheet,
  type SalaryStructure,
  type StoresRequisition,
} from "./types";

const BIZ = {
  chitumbo: "biz-chitumbo",
  abitehcal: "biz-abitehcal",
  health: "biz-health",
  flowbreeds: "biz-flowbreeds",
};

const businesses: Business[] = [
  { id: BIZ.chitumbo, name: "Chitumbo Farm" },
  { id: BIZ.abitehcal, name: "Abitehcal Farm" },
  { id: BIZ.health, name: "Abitehcal Gardens / Health Shop" },
  { id: BIZ.flowbreeds, name: "Flowbreeds Farm Shop" },
];

// [name, basic, leaveEntitled, nrc?, napsaNo?]
const STAFF: Array<[string, number, number, string?, string?]> = [
  ["Tutu Shichiingwe Chitumbo", 0, 24, "308292/67/1"],
  ["Vincent Nchele", 1200, 24, "109577/86/1"],
  ["William Mwalwanda", 1000, 24, "297026/61/1"],
  ["Phineas Munchelenga", 800, 24, "124634/97/1"],
  ["Teddy Tabangwa", 800, 24],
  ["Kelvin Mwenda", 800, 24],
  ["Rose Sileu", 800, 24],
  ["Queen Kayombo", 650, 24],
  ["Dennis Sileu", 700, 24],
  ["Godfrey Kayombo", 650, 24],
  ["Nico Sileu", 650, 24],
  ["Joseph", 650, 24],
  ["Joshua Mwansa", 650, 24],
  ["Ngosa", 650, 24],
  ["Nicholus Manda", 650, 24],
  ["Steve Mumba", 650, 24],
  ["Brenda Mwalwanda", 450, 16],
  ["Sharon Mwalwanda", 450, 24],
  ["Willie Mwalwanda", 450, 24],
  ["Chilufya", 450, 24],
  ["Julliet", 450, 24],
  ["Jophan", 450, 24],
  ["Misca Mwiinga", 250, 16],
];

const employees: Employee[] = STAFF.map(([name, basic, leave, nrc], i) => ({
  id: `emp-${i + 1}`,
  businessId: BIZ.chitumbo,
  name,
  nrc,
  napsaNo: undefined,
  position: i === 0 ? "Managing Director" : "Worker",
  basicPay: basic,
  leaveEntitled: leave,
  active: true,
}));

const empId = (name: string) =>
  employees.find((e) => e.name === name)?.id ?? null;

// A sample monthly register in the redesigned August 2022 layout.
const augustRun: PayrollRun = {
  id: "run-aug",
  businessId: BIZ.chitumbo,
  month: 8,
  year: 2022,
  workingDays: DEFAULT_WORKING_DAYS,
  recoveryRate: DEFAULT_RECOVERY_RATE,
  createdAt: new Date("2022-08-28").toISOString(),
  rows: employees
    .filter((e) => e.basicPay > 0)
    .map((e) => ({
      id: `runrow-${e.id}`,
      employeeId: e.id,
      name: e.name,
      rate: e.basicPay,
      overtime: 0,
      piecework: 0,
      absentDays: 0,
      advance: 0,
      balBf: 0,
      zesco: e.basicPay >= 800 ? 50 : 25,
      other: 0,
    })),
};

const napsaSchedule: NapsaSchedule = {
  id: "napsa-1",
  label: "Chitumbo Farm — monthly",
  businessId: BIZ.chitumbo,
  rate: NAPSA_RATE,
  rows: employees.map((e) => ({
    id: `napsa-row-${e.id}`,
    employeeId: e.id,
    name: e.name,
    nrc: e.nrc,
    napsaNo: e.napsaNo,
    basicPay: e.basicPay,
  })),
};

const leaveLedger: LeaveLedger = {
  id: "leave-2020",
  year: 2020,
  dayRate: DEFAULT_LEAVE_DAY_RATE,
  rows: employees.map((e) => ({
    id: `leave-row-${e.id}`,
    employeeId: e.id,
    name: e.name,
    allocated: e.leaveEntitled ?? 24,
    taken: [],
  })),
};

const salaryStructures: SalaryStructure[] = [
  {
    id: "struct-abitehcal",
    businessId: BIZ.abitehcal,
    title: "Abitehcal Farm — Salary structure",
    rows: [
      { id: "s1", role: "All heads", salaryAmt: 1400, people: 1, payGrade: "CF 1" },
      { id: "s2", role: "Workers long serving (6yrs+)", salaryAmt: 1200, people: 1, payGrade: "CF 2" },
      { id: "s3", role: "Workers general", salaryAmt: 1000, people: 2, payGrade: "CF 3" },
      { id: "s4", role: "Maid", salaryAmt: 1000, people: 1, payGrade: "CF 3" },
      { id: "s5", role: "Permanent piece workers 1", salaryAmt: 450, people: 1, payGrade: "CF 4" },
      { id: "s6", role: "Permanent piece workers 2", salaryAmt: 300, people: 1, payGrade: "CF 5" },
    ],
  },
  {
    id: "struct-flowbreeds",
    businessId: BIZ.flowbreeds,
    title: "Flowbreeds Farm Shop — Salary structure",
    rows: [
      { id: "f1", role: "All heads", salaryAmt: 3000, people: 4, payGrade: "CF 1" },
      { id: "f2", role: "Workers long serving (6yrs+)", salaryAmt: 1200, people: 0, payGrade: "CF 2" },
      { id: "f3", role: "Cashier", salaryAmt: 1000, people: 3, payGrade: "CF 3" },
      { id: "f4", role: "Cleaner", salaryAmt: 800, people: 2, payGrade: "CF 3" },
      { id: "f5", role: "Permanent piece workers", salaryAmt: 450, people: 1, payGrade: "CF 4" },
      { id: "f6", role: "Driver", salaryAmt: 1200, people: 1, payGrade: "CF 2" },
    ],
  },
];

const pieceworkSheets: PieceworkSheet[] = [
  {
    id: "piece-abitehcal",
    businessId: BIZ.abitehcal,
    title: "Abitehcal Farm — casual rates",
    rate30: 1000,
    ratePerDay: 35,
    ratePerHalfDay: 18,
    workers: [],
  },
];

const dismissalPays: DismissalPay[] = [
  {
    id: "dis-william",
    name: "William Mwalwanda",
    businessId: BIZ.chitumbo,
    period: "1/05/21 to 30/06/23",
    dues: [950, 870, 750, 750, 750].map((amount, i) => ({ id: `dw${i}`, amount })),
    leaveDays: [
      { id: "lw1", label: "Year 1", amount: 1000 },
      { id: "lw2", label: "Year 2", amount: 700, desc: "Year not completed" },
    ],
    benefits: [{ id: "bw1", label: "Benefits", amount: 0, desc: "Dismissed — no benefits" }],
    deductions: [{ id: "ddw1", amount: 2450, desc: "Balance from school fees loan" }],
    createdAt: new Date("2023-06-30").toISOString(),
  },
  {
    id: "dis-teddy",
    name: "Teddy Tabangwa",
    businessId: BIZ.chitumbo,
    period: "5 years",
    dues: [750, 750, 750, 750, 400, 550].map((amount, i) => ({ id: `dt${i}`, amount })),
    leaveDays: [
      { id: "lt1", label: "Year 1", amount: 0, desc: "3 weeks suspension" },
      { id: "lt2", label: "Year 2", amount: 750 },
      { id: "lt3", label: "Year 3", amount: 750 },
    ],
    benefits: [{ id: "bt1", label: "Benefits", amount: 0 }],
    deductions: [{ id: "ddt1", amount: 1100, desc: "Balance from money charged" }],
    createdAt: new Date("2023-06-30").toISOString(),
  },
  {
    id: "dis-kelvin",
    name: "Kelvin Mwenda",
    businessId: BIZ.chitumbo,
    period: "5 years",
    dues: [550, 650, 750, 750, 750].map((amount, i) => ({ id: `dk${i}`, amount })),
    leaveDays: [
      { id: "lk1", label: "Year 1", amount: 0 },
      { id: "lk2", label: "Year 2", amount: 750 },
      { id: "lk3", label: "Year 3", amount: 750 },
    ],
    benefits: [{ id: "bk1", label: "Benefits", amount: 0, desc: "Dismissed" }],
    deductions: [
      { id: "ddk1", amount: 1000, desc: "Wire theft" },
      { id: "ddk2", amount: 300, desc: "Net theft" },
      { id: "ddk3", amount: 600, desc: "School fees" },
      { id: "ddk4", amount: 200, desc: "Mealie meal" },
      { id: "ddk5", amount: 150, desc: "Charcoal" },
      { id: "ddk6", amount: 200, desc: "Bana Martin" },
    ],
    createdAt: new Date("2023-06-30").toISOString(),
  },
  {
    id: "dis-dennis",
    name: "Dennis Sileu",
    businessId: BIZ.chitumbo,
    period: "—",
    dues: [450, 550, 550, 530, 650, 650, 450, 100].map((amount, i) => ({ id: `dd${i}`, amount })),
    leaveDays: [{ id: "ld1", label: "Leave days", amount: 650 }],
    benefits: [{ id: "bd1", label: "Benefits", amount: 0 }],
    deductions: [{ id: "ddd1", amount: 500, desc: "Less debts" }],
    createdAt: new Date("2023-06-30").toISOString(),
  },
];

const storesRequisitions: StoresRequisition[] = [
  {
    id: "store-1",
    businessId: BIZ.flowbreeds,
    position: "",
    no: "0001",
    date: undefined,
    items: [
      { id: "si1", itemCode: "", description: "", qtyOrdered: 0, qtyIssued: 0 },
      { id: "si2", itemCode: "", description: "", qtyOrdered: 0, qtyIssued: 0 },
      { id: "si3", itemCode: "", description: "", qtyOrdered: 0, qtyIssued: 0 },
    ],
    authorisedBy: "",
    issuedBy: "",
    receivedBy: "",
    createdAt: new Date().toISOString(),
  },
];

export function seedPayroll(): PayrollState {
  return {
    businesses,
    employees,
    payrollRuns: [augustRun],
    napsaSchedules: [napsaSchedule],
    debtLedgers: [
      {
        id: "debt-1",
        employeeId: empId("Kelvin Mwenda"),
        name: "Kelvin Mwenda",
        entries: [
          { id: "de1", date: "2022-02-01", amount: 750, purpose: "Cash advance", entered: true },
          { id: "de2", date: "2022-03-01", amount: 750, purpose: "Cash advance", entered: true },
        ],
      },
    ],
    advanceRequests: [],
    pieceworkSheets,
    leaveLedgers: [leaveLedger],
    leaveApplications: [],
    storesRequisitions,
    salaryStructures,
    dismissalPays,
    payslips: [],
    settings: {
      napsaRate: NAPSA_RATE,
      workingDays: DEFAULT_WORKING_DAYS,
      recoveryRate: DEFAULT_RECOVERY_RATE,
      leaveDayRate: DEFAULT_LEAVE_DAY_RATE,
    },
  };
}
