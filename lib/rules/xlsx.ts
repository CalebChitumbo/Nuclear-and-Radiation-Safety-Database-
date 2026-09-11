/**
 * A minimal Excel (.xlsx) writer — enough of the Office Open XML package to
 * hand SharePoint a workbook Excel opens without complaint, and nothing more.
 *
 * WHY NOT A LIBRARY
 *
 * The one thing the section asked for is a file it can upload to SharePoint,
 * and a CSV is not that: SharePoint previews it as text, Excel opens it with
 * the wrong encoding half the time, and a workbook with one sheet cannot carry
 * the office, the period, the daily totals AND the underlying entries at once.
 * A real .xlsx is a ZIP of XML parts, and the parts a workbook of plain text
 * and numbers needs fit in this file. Everything is deterministic and pure, so
 * the workbook a page builds is the workbook a test can open.
 *
 * WHAT IT WRITES
 *
 * - Each sheet is a grid of cells: a number becomes a numeric cell, a string an
 *   inline string (no shared-strings table to keep in step), and an empty
 *   value no cell at all.
 * - The first row of each sheet is bold and frozen — every sheet here has a
 *   header row.
 * - Column widths are sized to the longest value in the column, capped so a
 *   remark does not push the sheet off screen.
 * - ZIP entries are STORED (no compression). The workbooks this app produces
 *   are a few hundred kilobytes at most, and a stored entry needs no deflate
 *   implementation — Excel and SharePoint read either.
 */

export type CellValue = string | number | null | undefined;

export interface WorkbookSheet {
  /** Sheet tab name; sanitised to Excel's 31-character, no-punctuation rule. */
  name: string;
  /** Rows of cells. The first row is the header row. */
  rows: CellValue[][];
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters are not legal in XML 1.0 and Excel refuses the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Column index (0-based) → Excel column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * A sheet name Excel accepts: none of `[]:*?/\`, at most 31 characters, not
 * empty. Names that collide after sanitising are numbered by the caller.
 */
export function sanitiseSheetName(name: string): string {
  const cleaned = (name || "")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31)
    .trim();
  return cleaned || "Sheet";
}

function cellXml(ref: string, value: CellValue, header: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  const style = header ? ' s="1"' : "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(
    String(value),
  )}</t></is></c>`;
}

function sheetXml(sheet: WorkbookSheet): string {
  const widths: number[] = [];
  const rows: string[] = [];
  sheet.rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((value, c) => {
      const text =
        value === null || value === undefined ? "" : String(value);
      widths[c] = Math.max(widths[c] || 0, text.length);
      const xml = cellXml(`${columnLetters(c)}${r + 1}`, value, r === 0);
      if (xml) cells.push(xml);
    });
    rows.push(`<row r="${r + 1}">${cells.join("")}</row>`);
  });

  const cols = widths.length
    ? `<cols>${widths
        .map((w, i) => {
          // Excel's width unit is roughly one character; a little padding
          // keeps bold headers from clipping, and the cap keeps remarks sane.
          const width = Math.min(60, Math.max(8, w + 2));
          return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
        })
        .join("")}</cols>`
    : "";

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    "</sheetView></sheetViews>" +
    cols +
    `<sheetData>${rows.join("")}</sheetData>` +
    "</worksheet>"
  );
}

const CONTENT_TYPES = (count: number) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("") +
  "</Types>";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK_RELS = (count: number) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("") +
  `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  "</Relationships>";

const WORKBOOK = (names: string[]) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  "<sheets>" +
  names
    .map(
      (n, i) =>
        `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("") +
  "</sheets></workbook>";

/** Two cell styles: 0 = default, 1 = bold (the header row). */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

// ---------------------------------------------------------------------------
// ZIP (stored entries only)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/**
 * A ZIP archive holding the entries uncompressed. The timestamp is fixed
 * (1 Jan 2026, 00:00 — the earliest DOS time the plan year allows), so the
 * same workbook content produces byte-identical files.
 */
export function zipStored(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const dosTime = u16(0);
  const dosDate = u16(((2026 - 1980) << 9) | (1 << 5) | 1);

  for (const e of entries) {
    const name = encoder.encode(e.name);
    const crc = crc32(e.data);
    const header = Uint8Array.from([
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0x0800), // flags: UTF-8 names
      ...u16(0), // method: stored
      ...dosTime,
      ...dosDate,
      ...u32(crc),
      ...u32(e.data.length),
      ...u32(e.data.length),
      ...u16(name.length),
      ...u16(0), // extra length
    ]);
    local.push(header, name, e.data);

    central.push(
      Uint8Array.from([
        ...u32(0x02014b50),
        ...u16(20), // version made by
        ...u16(20), // version needed
        ...u16(0x0800),
        ...u16(0),
        ...dosTime,
        ...dosDate,
        ...u32(crc),
        ...u32(e.data.length),
        ...u32(e.data.length),
        ...u16(name.length),
        ...u16(0), // extra
        ...u16(0), // comment
        ...u16(0), // disk
        ...u16(0), // internal attrs
        ...u32(0), // external attrs
        ...u32(offset),
      ]),
      name,
    );
    offset += header.length + name.length + e.data.length;
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),
  ]);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...local, ...central, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The workbook
// ---------------------------------------------------------------------------

/** The XML parts of a workbook, by path inside the package. */
export function workbookParts(sheets: WorkbookSheet[]): Record<string, string> {
  if (sheets.length === 0) {
    throw new Error("A workbook needs at least one sheet.");
  }
  // Sheet names must be unique after sanitising; a repeat gets a number.
  const names: string[] = [];
  for (const s of sheets) {
    const base = sanitiseSheetName(s.name);
    let name = base;
    for (let n = 2; names.includes(name); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    names.push(name);
  }
  const parts: Record<string, string> = {
    "[Content_Types].xml": CONTENT_TYPES(sheets.length),
    "_rels/.rels": ROOT_RELS,
    "xl/workbook.xml": WORKBOOK(names),
    "xl/_rels/workbook.xml.rels": WORKBOOK_RELS(sheets.length),
    "xl/styles.xml": STYLES,
  };
  sheets.forEach((s, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s);
  });
  return parts;
}

/** Build the .xlsx file — the bytes to download or upload. */
export function buildXlsx(sheets: WorkbookSheet[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts = workbookParts(sheets);
  return zipStored(
    Object.entries(parts).map(([name, xml]) => ({
      name,
      data: encoder.encode(xml),
    })),
  );
}

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
