import { describe, expect, it } from "vitest";
import {
  FORM_I_CHECKLIST,
  REQUIRED_CHECKLIST_IDS,
  checklistComplete,
  checklistPatch,
  checklistProgress,
} from "../lib/rules/checklist";

function allRequiredTicked(): Record<string, boolean> {
  const c: Record<string, boolean> = {};
  for (const id of REQUIRED_CHECKLIST_IDS) c[id] = true;
  return c;
}

describe("Form I checklist", () => {
  it("carries the SOP attachment list", () => {
    const ids = FORM_I_CHECKLIST.map((i) => i.id);
    for (const id of ["form-i", "pacra", "workers", "rpo", "rpsp", "payment"]) {
      expect(ids).toContain(id);
    }
  });

  it("judges completeness on required items only", () => {
    const c = allRequiredTicked();
    expect(checklistComplete(c)).toBe(true);
    // Optional items (disposal / leak-test) don't block completeness.
    expect(c["disposal"]).toBeUndefined();

    delete c["rpo"];
    expect(checklistComplete(c)).toBe(false);
    expect(checklistComplete(undefined)).toBe(false);
  });

  it("reports progress", () => {
    const { received, required } = checklistProgress({ "form-i": true, pacra: true });
    expect(received).toBe(2);
    expect(required).toBe(REQUIRED_CHECKLIST_IDS.length);
  });

  it("stamps the complete date once and keeps it stable", () => {
    const first = checklistPatch({}, allRequiredTicked(), "2026-06-10");
    expect(first.completeReceivedAt).toBe("2026-06-10");

    // Re-saving a complete checklist later keeps the ORIGINAL day-zero.
    const again = checklistPatch(
      { completeReceivedAt: "2026-06-10" },
      allRequiredTicked(),
      "2026-07-01",
    );
    expect(again.completeReceivedAt).toBe("2026-06-10");
  });

  it("clears the stamp when the checklist stops being complete", () => {
    const c = allRequiredTicked();
    c["payment"] = false;
    const patch = checklistPatch(
      { completeReceivedAt: "2026-06-10" },
      c,
      "2026-07-01",
    );
    expect(patch.completeReceivedAt).toBeUndefined();
  });
});
