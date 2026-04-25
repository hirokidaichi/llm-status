// 軽量テーブルレンダラ。色付き文字列を含むセル幅を考慮する。
const ANSI_RE = /\x1b\[[0-9;]*m/g;

const visibleLength = (s: string): number => s.replace(ANSI_RE, "").length;

const pad = (s: string, width: number, align: "left" | "right" = "left"): string => {
  const visible = visibleLength(s);
  const space = Math.max(0, width - visible);
  return align === "right" ? " ".repeat(space) + s : s + " ".repeat(space);
};

export type Column = {
  header: string;
  align?: "left" | "right";
};

export const renderTable = (cols: Column[], rows: string[][]): string => {
  const widths = cols.map((c, i) =>
    Math.max(visibleLength(c.header), ...rows.map((r) => visibleLength(r[i] ?? ""))),
  );
  const sep = " │ ";
  const header = cols.map((c, i) => pad(c.header, widths[i] ?? 0, c.align)).join(sep);
  const rule = widths.map((w) => "─".repeat(w)).join("─┼─");
  const body = rows
    .map((r) => r.map((cell, i) => pad(cell ?? "", widths[i] ?? 0, cols[i]?.align)).join(sep))
    .join("\n");
  return `${header}\n${rule}\n${body}`;
};
