import pc from "picocolors";

// 既定は picocolors の自動判定（TTY なら色あり / パイプ・リダイレクトなら色なし）。
// statusline は Claude Code に **パイプ**で渡される（= 非 TTY）ため、このままだと
// 色が自動抑制されて全部端末デフォルト色（灰色）になってしまう。出力先は実際には
// 端末なので、statusline 実行時のみ enableColorForStatusline() で強制有効化する。
// `export let` のライブバインディングにより、再代入は import 先からも参照される。
export let c: ReturnType<typeof pc.createColors> = pc;

// statusline 用に色を強制 ON にする。NO_COLOR が設定されていれば尊重して無効のまま。
export const enableColorForStatusline = (): void => {
  if (process.env.NO_COLOR) return;
  c = pc.createColors(true);
};

// statusline の補助テキスト（ラベル・区切り・電池の空セル・reset 時刻など）用の
// 控えめな色。ANSI の dim は端末テーマによって暗すぎて読めないため、明るめの
// グレー（blackBright）を使う。ここ 1 箇所を変えれば全体の「グレー」の明るさを
// 調整できる（さらに明るくしたいなら c.white に変える）。
export const muted = (s: string): string => c.blackBright(s);

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
