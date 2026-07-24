/**
 * Trigger a browser download of a generated text file (CSV etc.). The BOM
 * makes Excel open UTF-8 CSVs with the right encoding.
 */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8",
): void {
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
