// Animated SVG for the contribution snake. CSS keyframes only (GitHub serves SVGs as <img>, so
// no scripts), and everything stops under prefers-reduced-motion, leaving the static graph.
//
// The snake is one stroked path along the route. stroke-dasharray is the body length and
// stroke-dashoffset the tail position, so growth costs two keyframes per meal, not one per
// segment per step.

import { escapeXml } from "../stats/render.mjs";
import { ROWS } from "./plan.mjs";

export const THEMES = {
  dark: { empty: "#161B22", levels: ["#0E4429", "#006D32", "#26A641", "#39D353"], snake: "#2563EB" },
  light: { empty: "#EBEDF0", levels: ["#9BE9A8", "#40C463", "#30A14E", "#216E39"], snake: "#2563EB" },
};

const CELL = 10;
const PITCH = 12;
const MARGIN = 6;
const STEP_MS = 90;
const FADE_IN_MS = 300;
const HOLD_MS = 2000;
const FADE_OUT_MS = 800;

const pct = (ms, total) => `${Number(((ms / total) * 100).toFixed(4))}%`;
const center = (n) => MARGIN + n * PITCH + CELL / 2;

export function timing(steps) {
  const move = steps * STEP_MS;
  const fadeStart = move + HOLD_MS;
  return { move, fadeStart, total: fadeStart + FADE_OUT_MS };
}

// Keep only the corners: every step has the same length, so dropping collinear points leaves
// the path length (and therefore the dash maths) unchanged.
export function routePath(route) {
  const points = route.filter((p, i) => {
    if (i === 0 || i === route.length - 1) return true;
    const a = route[i - 1];
    const b = route[i + 1];
    return (p.x - a.x) * (b.y - p.y) !== (p.y - a.y) * (b.x - p.x);
  });
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${center(p.x)} ${center(p.y)}`).join("");
}

// A keyframe is needed only where the tail switches between holding still and following.
export function snakeKeyframes(plan, total) {
  const { frames } = plan;
  // The gap must outlast the whole path so the dash pattern never repeats onto the grid.
  const span = plan.route.length * PITCH;
  const first = frames[0].head;
  const grows = (i) => frames[i + 1].length > frames[i].length;

  const out = [];
  frames.forEach((frame, i) => {
    const edge = i === 0 || i === frames.length - 1;
    if (!edge && grows(i - 1) === grows(i)) return;
    const dash = (frame.length - 1) * PITCH;
    const offset = -(frame.head - frame.length + 1) * PITCH;
    out.push(`${pct((frame.head - first) * STEP_MS, total)}{stroke-dasharray:${dash}px ${span}px;stroke-dashoffset:${offset}px}`);
  });
  const last = frames[frames.length - 1];
  out.push(`100%{stroke-dasharray:${(last.length - 1) * PITCH}px ${span}px;stroke-dashoffset:${-(last.head - last.length + 1) * PITCH}px}`);
  return out.join("");
}

export function renderSnake(grid, plan, { themeName, login }) {
  const t = THEMES[themeName];
  if (!t) throw new Error(`Unknown theme: ${themeName}`);

  const { fadeStart, total } = timing(plan.steps);
  const width = MARGIN * 2 + grid.columns * PITCH - (PITCH - CELL);
  const height = MARGIN * 2 + ROWS * PITCH - (PITCH - CELL);
  const eatenAt = new Map(plan.eaten.map((e) => [`${e.x},${e.y}`, e.step]));

  const rules = [];
  const rects = grid.cells.map((cell) => {
    const fill = cell.level > 0 ? t.levels[cell.level - 1] : t.empty;
    const attrs = `x="${MARGIN + cell.x * PITCH}" y="${MARGIN + cell.y * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}"`;
    const step = eatenAt.get(`${cell.x},${cell.y}`);
    if (step === undefined) return `<rect ${attrs}/>`;
    // The cell vanishes as the head reaches it, and comes back while the snake fades out.
    const gone = (step - 0.5) * STEP_MS;
    const name = `e${cell.x}_${cell.y}`;
    rules.push(`@keyframes ${name}{0%,${pct(gone, total)}{fill:${fill}}${pct(gone + 1, total)},${pct(fadeStart, total)}{fill:${t.empty}}100%{fill:${fill}}}`);
    return `<rect class="c" style="animation-name:${name}" ${attrs}/>`;
  });

  const title = `Snake eating ${login}'s contribution graph one week at a time, growing from ${plan.startLength} to ${plan.finalLength} segments as it eats each active day`;
  const duration = `${total}ms`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
<title id="title">${escapeXml(title)}</title>
<style>
.c{animation:${duration} linear infinite}
.g{opacity:0;animation:fade ${duration} linear infinite}
.s{animation:grow ${duration} linear infinite}
@keyframes fade{0%{opacity:0}${pct(FADE_IN_MS, total)},${pct(fadeStart, total)}{opacity:1}100%{opacity:0}}
@keyframes grow{${snakeKeyframes(plan, total)}}
${rules.join("\n")}
@media (prefers-reduced-motion: reduce){.c,.g,.s{animation:none}}
</style>
${rects.join("\n")}
<g class="g"><path class="s" d="${routePath(plan.route)}" fill="none" stroke="${t.snake}" stroke-width="${CELL - 1}" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>
`;
}
