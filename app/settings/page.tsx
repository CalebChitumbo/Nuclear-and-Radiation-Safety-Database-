"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { store, resetMockStore } from "@/lib/store";
import { Panel } from "@/components/Section";
import { useToast } from "@/components/Toast";
import { isMockMode } from "@/lib/firebase";
import { PROVINCES, type Facility } from "@/lib/rules/types";

export default function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const exportJson = async () => {
    setBusy(true);
    try {
      const s = await store();
      const data = await s.exportAll();
      download(
        JSON.stringify(data, null, 2),
        `rpa-export-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
      );
      toast.push("Full data export downloaded.", "success");
    } catch (err) {
      toast.push(
        `Export failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const exportRegisterCsv = async () => {
    setBusy(true);
    try {
      const s = await store();
      const { facilities } = await s.exportAll();
      const csv = registerToCsv(facilities);
      download(
        csv,
        `rpa-register-${new Date().toISOString().slice(0, 10)}.csv`,
        "text/csv",
      );
      toast.push("Register CSV downloaded.", "success");
    } catch (err) {
      toast.push(
        `Export failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const exportRegisterXlsx = async () => {
    setBusy(true);
    try {
      const s = await store();
      const { facilities } = await s.exportAll();
      // SpreadsheetML 2003 — opens in Excel/LibreOffice without an extra dep.
      const xml = registerToXmlSpreadsheet(facilities);
      download(
        xml,
        `rpa-register-${new Date().toISOString().slice(0, 10)}.xls`,
        "application/vnd.ms-excel",
      );
      toast.push("Register spreadsheet downloaded.", "success");
    } catch (err) {
      toast.push(
        `Export failed: ${err instanceof Error ? err.message : err}`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 staggered">
      <Panel title="Profile">
        <div className="font-bold">{user?.displayName || "—"}</div>
        <div className="text-sm text-gunmetal/65 break-words">
          {user?.email}
        </div>
        <div className="text-xs text-gunmetal/55 mt-1">
          {user?.role} · {user?.section}
        </div>
      </Panel>

      <Panel
        title="Export &amp; backup"
        note="The dated event log is the source of truth. Exports capture the register and the events that produced it, so the database can always be rebuilt."
      >
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={exportJson}
          >
            Full data (JSON)
          </button>
          <button
            disabled={busy}
            className="btn btn-secondary flex-1 sm:flex-none"
            onClick={exportRegisterCsv}
          >
            Register (CSV)
          </button>
          <button
            disabled={busy}
            className="btn btn-secondary flex-1 sm:flex-none"
            onClick={exportRegisterXlsx}
          >
            Register (XLS)
          </button>
        </div>
      </Panel>

      <Panel title="Environment">
        <div className="text-sm">
          Mode:{" "}
          <strong>
            {isMockMode ? "Mock (in-memory + localStorage)" : "Firebase"}
          </strong>
        </div>
        {isMockMode ? (
          <div className="mt-3">
            {!confirmReset ? (
              <button
                className="btn btn-danger"
                onClick={() => setConfirmReset(true)}
              >
                Reset mock data
              </button>
            ) : (
              <div className="inset p-3 space-y-3">
                <p className="text-sm text-gunmetal/70">
                  Confirm reset (re-seeds 538 facilities, clears events &amp;
                  inspections)?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      await resetMockStore();
                      toast.push("Mock data reset to seed.", "success");
                      setConfirmReset(false);
                    }}
                  >
                    Yes, reset
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Panel>

      <Panel title="Reference data">
        <p className="text-sm text-gunmetal/70">
          Provinces and licence types are sourced from{" "}
          <code>config/referenceLists</code> in Firestore (read-only here). The
          ten provinces are: {PROVINCES.join(", ")}.
        </p>
      </Panel>
    </div>
  );
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function registerToCsv(facilities: Facility[]): string {
  const header = [
    "No",
    "Name",
    "District",
    "Province",
    "Practice",
    "Sector",
    "Licensed",
    "Stage",
    "FAC code",
    "Authorisation numbers",
  ];
  const rows = facilities.map((f) =>
    [
      String(f.no || ""),
      f.name,
      f.district,
      f.province,
      f.practice,
      f.sector,
      f.licensed ? "Yes" : "No",
      f.stage,
      f.facCode,
      (f.auths || []).map((a) => a.number).filter(Boolean).join("; "),
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function registerToXmlSpreadsheet(facilities: Facility[]): string {
  const header = [
    "No",
    "Name",
    "District",
    "Province",
    "Practice",
    "Sector",
    "Licensed",
    "Stage",
    "FAC code",
    "Authorisation numbers",
  ];
  const rowXml = (cells: string[]) =>
    `<Row>${cells
      .map(
        (c) =>
          `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`,
      )
      .join("")}</Row>`;
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="RPA Register"><Table>
${rowXml(header)}
${facilities
  .map((f) =>
    rowXml([
      String(f.no || ""),
      f.name,
      f.district,
      f.province,
      f.practice,
      f.sector,
      f.licensed ? "Yes" : "No",
      f.stage,
      f.facCode,
      (f.auths || []).map((a) => a.number).filter(Boolean).join("; "),
    ]),
  )
  .join("\n")}
</Table></Worksheet></Workbook>`;
}
