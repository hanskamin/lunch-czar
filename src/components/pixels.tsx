/**
 * Hand-drawn pixel sprites. Each sprite is a string grid; the legend maps a
 * character to a color. In the terminal every character cell holds two
 * vertically stacked pixels via half-block glyphs (▀ ▄ █), which keeps the
 * pixels square-ish and the art crisp — the same sprites as the web app.
 */

import { PLUM, PLUM_DEEP, PLUM_LIGHT, GOLD, TEAL_BRIGHT, WINDOW } from "../theme";

const LEGEND: Record<string, string> = {
  G: "#f2b738", // regalia gold
  g: "#a37b1e", // gold shadow
  R: "#c22b2b", // imperial crimson
  r: "#7a1220", // banner shadow
  S: "#e8b890", // skin
  K: "#160e1e", // outline / midnight
  B: "#5b3a29", // beard
  W: "#f3e4c3", // parchment / ermine
  T: "#2e9e8f", // byzantine teal
  t: "#46c9b5", // teal bright
  A: "#8a7d96", // ash
  P: "#241534", // plum
  p: "#3a2751", // plum light
  Y: "#ffd97a", // lit window
};

/** Scale a sprite grid by an integer factor (duplicate rows and columns). */
function scaleMap(map: string[], scale: number): string[] {
  if (scale <= 1) return map;
  const out: string[] = [];
  for (const row of map) {
    const wide = [...row].map((ch) => ch.repeat(scale)).join("");
    for (let i = 0; i < scale; i++) out.push(wide);
  }
  return out;
}

export function Sprite({
  map,
  scale = 1,
  legend,
  flip = false,
}: {
  map: string[];
  scale?: number;
  legend?: Record<string, string>;
  flip?: boolean;
}) {
  const colors = { ...LEGEND, ...legend };
  let grid = scaleMap(map, scale);
  if (flip) grid = grid.map((row) => [...row].reverse().join(""));
  const w = Math.max(...grid.map((r) => r.length));
  const rows: React.ReactNode[] = [];
  for (let y = 0; y < grid.length; y += 2) {
    const topRow = grid[y] ?? "";
    const botRow = grid[y + 1] ?? "";
    const spans: React.ReactNode[] = [];
    for (let x = 0; x < w; x++) {
      const top = colors[topRow[x] ?? " "];
      const bot = colors[botRow[x] ?? " "];
      if (top && bot) spans.push(<span key={x} fg={top} bg={bot}>▀</span>);
      else if (top) spans.push(<span key={x} fg={top}>▀</span>);
      else if (bot) spans.push(<span key={x} fg={bot}>▄</span>);
      else spans.push(<span key={x}> </span>);
    }
    rows.push(
      <text key={y} wrapMode="none" height={1}>
        {spans}
      </text>,
    );
  }
  // Fixed width + no shrink: sprites must never be squeezed by neighboring
  // flex children, or their rows would wrap and shred the pixel art.
  return (
    <box flexDirection="column" width={w} flexShrink={0}>
      {rows}
    </box>
  );
}

/* ── The Queen — kokoshnik-crowned, ermine-gowned ─────────────── */
export const QUEEN = [
  "....GGGG....",
  "...GGGGGG...",
  "..GGGTTGGG..",
  "..GgGGGGgG..",
  "..BSSSSSSB..",
  "..BSKSSKSB..",
  "..BSSSSSSB..",
  "..BSSRRSSB..",
  "..WWRRRRWW..",
  ".WRRRGGRRRW.",
  ".WRRRGGRRRW.",
  ".WRRRRRRRRW.",
  ".WRRRRRRRRW.",
  ".WRrRRRRrRW.",
  ".WWWWWWWWWW.",
];

/* ── Double-headed eagle, heraldic gold ───────────────────────── */
export const EAGLE = [
  ".......GG.......",
  "..GG..GGGG..GG..",
  ".GGGG.GKGG.GGGG.",
  ".GgGGGGGGGGGGgG.",
  "GGGGGGGGGGGGGGGG",
  "G.GGGGGGGGGGGG.G",
  "..GgGGGGGGGGgG..",
  "...GGGGGGGGGG...",
  "....GG.gg.GG....",
  ".....G.GG.G.....",
  "......GGGG......",
  ".......GG.......",
];

/* ── Small crown, for list markers and the winner ─────────────── */
export const CROWN = [
  "G..GG..G",
  "G.GGGG.G",
  "GGGGGGGG",
  ".GgGGgG.",
];

/* ── Pixel drumstick, for the feast ───────────────────────────── */
export const DRUMSTICK = [
  "...WWWW...",
  "..WWWWWW..",
  ".WWWWWWWW.",
  ".WWWWWWgW.",
  "..WWWWWW..",
  "...gWWg...",
  "....gg....",
  "...GG.....",
  "..GG.GG...",
  ".GG...GG..",
];

/* ── Onion-dome tower. Dome char is D, body b, window w ───────── */
const TOWER = [
  ".....G......",
  "....GGG.....",
  ".....G......",
  ".....DD.....",
  "....DDDD....",
  "...DDDDDD...",
  "..DDDDDDDD..",
  "..DDDDDDDD..",
  "...DDDDDD...",
  "....DDDD....",
  "...bbbbbb...",
  "...bbwwbb...",
  "...bbwwbb...",
  "...bbbbbb...",
  "..bbbbbbbb..",
];

export function Tower({ state }: { state: "locked" | "active" | "done" }) {
  const legend =
    state === "locked"
      ? { D: PLUM_LIGHT, b: PLUM, w: PLUM_DEEP, G: PLUM_LIGHT }
      : state === "active"
        ? { D: TEAL_BRIGHT, b: PLUM_LIGHT, w: WINDOW, G: GOLD }
        : { D: GOLD, b: PLUM_LIGHT, w: WINDOW, G: GOLD };
  return <Sprite map={TOWER} legend={legend} />;
}
