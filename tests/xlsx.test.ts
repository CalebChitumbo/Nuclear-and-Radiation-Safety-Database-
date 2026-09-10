import { describe, expect, it } from "vitest";

import {
  buildXlsx,
  columnLetters,
  crc32,
  sanitiseSheetName,
  workbookParts,
  zipStored,
} from "../lib/rules/xlsx";

/**
 * A just-enough ZIP reader: walks the central directory and returns each
 * stored entry's bytes. The writer only ever stores, so no inflate is needed —
 * and reading the archive back through the central directory is exactly what
 * Excel does first.
 */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  // End of central directory record is the last 22 bytes (no comment).
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    expect(method).toBe(0);
    // Local header → data.
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, decoder.decode(data));
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("xlsx writer — cells and names", () => {
  it("numbers columns the way Excel does", () => {
    expect(columnLetters(0)).toBe("A");
    expect(columnLetters(25)).toBe("Z");
    expect(columnLetters(26)).toBe("AA");
    expect(columnLetters(27)).toBe("AB");
    expect(columnLetters(701)).toBe("ZZ");
    expect(columnLetters(702)).toBe("AAA");
  });

  it("keeps sheet names inside Excel's rules", () => {
    expect(sanitiseSheetName("Daily totals")).toBe("Daily totals");
    expect(sanitiseSheetName("Nakonde: Q3/2026 [draft]?")).toBe("Nakonde Q3 2026 draft");
    expect(sanitiseSheetName("x".repeat(40))).toHaveLength(31);
    expect(sanitiseSheetName("")).toBe("Sheet");
  });

  it("numbers sheets whose names collide", () => {
    const parts = workbookParts([
      { name: "Summary", rows: [["a"]] },
      { name: "Summary", rows: [["b"]] },
    ]);
    expect(parts["xl/workbook.xml"]).toContain('name="Summary"');
    expect(parts["xl/workbook.xml"]).toContain('name="Summary (2)"');
  });

  it("writes numbers as numeric cells and text as inline strings, escaped", () => {
    const parts = workbookParts([
      {
        name: "S",
        rows: [
          ["Office", "Vehicles"],
          ['Chirundu "east" <gate> & co', 120],
          ["", null],
        ],
      },
    ]);
    const sheet = parts["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<c r="B2"><v>120</v></c>');
    expect(sheet).toContain(
      "Chirundu &quot;east&quot; &lt;gate&gt; &amp; co",
    );
    // The header row is bold (style 1) and frozen.
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheet).toContain('state="frozen"');
    // Empty cells are not written at all.
    expect(sheet).toContain('<row r="3"></row>');
  });

  it("refuses an empty workbook", () => {
    expect(() => buildXlsx([])).toThrow();
  });
});

describe("xlsx writer — the package", () => {
  it("is a ZIP Excel can walk: every part present, CRCs right, stored", () => {
    const bytes = buildXlsx([
      { name: "Summary", rows: [["Item", "Value"], ["Vehicles screened", 430]] },
      { name: "Entries", rows: [["Date", "Office"], ["2026-09-01", "Nakonde"]] },
    ]);
    const parts = readZip(bytes);
    expect([...parts.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(parts.get("[Content_Types].xml")).toContain("/xl/worksheets/sheet2.xml");
    expect(parts.get("xl/workbook.xml")).toContain('<sheet name="Entries" sheetId="2" r:id="rId2"/>');
    expect(parts.get("xl/_rels/workbook.xml.rels")).toContain('Target="worksheets/sheet2.xml"');
    expect(parts.get("xl/worksheets/sheet2.xml")).toContain("Nakonde");
  });

  it("is deterministic — the same sheets give the same bytes", () => {
    const sheets = [{ name: "S", rows: [["a", 1]] }];
    expect(buildXlsx(sheets)).toEqual(buildXlsx(sheets));
  });

  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("keeps UTF-8 names and data intact through the archive", () => {
    const bytes = zipStored([
      { name: "café/été.txt", data: new TextEncoder().encode("Chirundu — Q3") },
    ]);
    const parts = readZip(bytes);
    expect(parts.get("café/été.txt")).toBe("Chirundu — Q3");
  });
});
