import pc from "picocolors";

export const c = pc;

export const fmtNum = (n: number): string => {
  if (n === 0) return "0";
  if (Math.abs(n) < 1000) return n.toString();
  return n.toLocaleString("en-US");
};

export const fmtCost = (usd: number): string => {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};

export const fmtPct = (p: number): string => {
  if (p >= 80) return c.red(`${p.toFixed(0)}%`);
  if (p >= 50) return c.yellow(`${p.toFixed(0)}%`);
  return c.green(`${p.toFixed(0)}%`);
};

export const fmtRelative = (date: Date | number): string => {
  const ts = date instanceof Date ? date.getTime() : date;
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const v = sec < 60 ? `${sec}s` : min < 60 ? `${min}m` : hr < 48 ? `${hr}h` : `${day}d`;
  return diff >= 0 ? `in ${v}` : `${v} ago`;
};
