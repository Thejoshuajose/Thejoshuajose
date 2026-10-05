// Animated SVG for the contribution snake. CSS keyframes only (GitHub serves SVGs as <img>, so
// no scripts), and everything stops under prefers-reduced-motion, leaving the static graph.
//
// The snake is a few stroked copies of the route path: two narrowing tail segments, the body and
// a lighter dorsal stripe. On each, stroke-dasharray is the visible length and stroke-dashoffset
// where it starts, so growth costs two keyframes per meal per copy, not one per segment per step.
// The head (eyes, flicking tongue) is a group moved and turned by CSS transform keyframes, one
// pair per corner, on the same clock as the body.

import { escapeXml } from "../stats/render.mjs";
import { ROWS } from "./plan.mjs";

const SNAKE = { snake: "#2563EB", stripe: "#60A5FA", head: "#1D4ED8", eye: "#F0F6FC", pupil: "#0D1117", tongue: "#F85149" };

export const THEMES = {
  dark: { empty: "#161B22", levels: ["#0E4429", "#006D32", "#26A641", "#39D353"], ...SNAKE },
  light: { empty: "#EBEDF0", levels: ["#9BE9A8", "#40C463", "#30A14E", "#216E39"], ...SNAKE },
};

const CELL = 10;
const PITCH = 12;
// Wide enough to show the one-cell ring the snake roams around the grid.
const MARGIN = 6 + PITCH;
const STEP_MS = 90;
const BAR_HEIGHT = 8;
const BAR_GAP = 2;
const FADE_IN_MS = 300;
const HOLD_MS = 2000;
const FADE_OUT_MS = 800;
const BODY_WIDTH = CELL - 1;
const STRIPE_WIDTH = 2.5;
// Stroke widths of the last segments before the tail tip, tip first.
export const TAPER = [3.5, 6];

const pct = (ms, total) => `${Number(((ms / total) * 100).toFixed(4))}%`;
const center = (n) => MARGIN + n * PITCH + CELL / 2;

export function timing(steps) {
  const move = steps * STEP_MS;
  const fadeStart = move + HOLD_MS;
  return { move, fadeStart, total: fadeStart + FADE_OUT_MS };
}

// Keep only the corners: every step has the same length, so dropping points that continue
// straight on leaves the path length (and therefore the dash maths) unchanged.
export function routePath(route) {
  const points = route.filter((p, i) => {
    if (i === 0 || i === route.length - 1) return true;
    const a = route[i - 1];
    const b = route[i + 1];
    return p.x - a.x !== b.x - p.x || p.y - a.y !== b.y - p.y;
  });
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${center(p.x)} ${center(p.y)}`).join("");
}

// Route indices the body copy covers in a frame: everything from the end of the taper to the head.
// Each taper segment covers one step, clamped to the head while the snake is shorter than the taper.
export function segments(frame) {
  const tail = frame.head - frame.length + 1;
  const at = (k) => Math.min(tail + k, frame.head);
  return [...TAPER.map((_, k) => ({ from: at(k), to: at(k + 1) })), { from: at(TAPER.length), to: frame.head }];
}

// Keyframes for one copy of the snake, picking its stretch of route with pick(frame). A keyframe is
// needed only where the tail switches between holding still and following, or while the snake is
// still shorter than its taper (when the clamping makes the motion non-linear).
export function dashKeyframes(plan, total, pick) {
  const { frames } = plan;
  // The gap must outlast the whole path so the dash pattern never repeats onto the grid.
  const span = plan.route.length * PITCH;
  const first = frames[0].head;
  const grows = (i) => frames[i + 1].length > frames[i].length;
  const key = (at, frame) => {
    const { from, to } = pick(frame);
    return `${at}{stroke-dasharray:${(to - from) * PITCH}px ${span}px;stroke-dashoffset:${-from * PITCH}px}`;
  };

  const out = [];
  frames.forEach((frame, i) => {
    const edge = i === 0 || i === frames.length - 1;
    if (!edge && frame.length > TAPER.length + 1 && grows(i - 1) === grows(i)) return;
    out.push(key(pct((frame.head - first) * STEP_MS, total), frame));
  });
  out.push(key("100%", frames[frames.length - 1]));
  return out.join("");
}

// How long the head takes to swing round a corner, centred on the corner itself.
const TURN_MS = 36;

const angleOf = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const fmt = (n) => Number(n.toFixed(2));

// The head's CSS transform keyframes. It moves one step per STEP_MS from frames[0].head to the end of
// the route, then waits there through the hold and fade. Straight runs need no keyframes; each
// corner gets two, TURN_MS apart, so the head swings round instead of snapping. Angles accumulate
// (never wrapping at ±180) so no interpolation ever spins the long way round.
// This is CSS, not SMIL <animateMotion>: the body is CSS, and browsers pause or throttle the two
// clocks independently (offscreen images, background tabs), which tore the head off the body.
export function headKeyframes(plan, total) {
  const { route, frames } = plan;
  const first = frames[0].head;
  const last = frames[frames.length - 1].head;
  const point = (i) => ({ x: center(route[i].x), y: center(route[i].y) });
  // Fractional route position -> pixel position, for the moments just before and after a corner.
  const along = (pos) => {
    const i = Math.floor(pos);
    const a = point(i);
    if (i >= route.length - 1) return a;
    const b = point(i + 1);
    const f = pos - i;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const key = (ms, p, angle) => `${pct(ms, total)}{transform:translate(${fmt(p.x)}px,${fmt(p.y)}px) rotate(${fmt(angle)}deg)}`;

  // Face the first move (any turn out of the coil happens while the snake fades in); a snake that
  // never moves keeps facing the way it came, and a lone cell faces up.
  let angle = -90;
  if (last > first) angle = angleOf(route[first], route[first + 1]);
  else if (first > 0) angle = angleOf(route[first - 1], route[first]);
  const out = [key(0, point(first), angle)];
  const half = TURN_MS / 2 / STEP_MS;
  for (let i = first + 1; i < last; i += 1) {
    const turn = (((angleOf(route[i], route[i + 1]) - angleOf(route[i - 1], route[i]) + 540) % 360) - 180) || 0;
    if (turn === 0) continue;
    const ms = (i - first) * STEP_MS;
    out.push(key(ms - TURN_MS / 2, along(i - half), angle));
    // A reversal is ±180 either way; normalising picks -180, which turns it the same way every time.
    angle += turn;
    out.push(key(ms + TURN_MS / 2, along(i + half), angle));
  }
  out.push(key((last - first) * STEP_MS, point(last), angle));
  out.push(`100%{transform:translate(${fmt(point(last).x)}px,${fmt(point(last).y)}px) rotate(${fmt(angle)}deg)}`);
  return out.join("");
}

// Drawn facing +x around the cell centre; headKeyframes moves and turns it.
function headShape(t) {
  const eye = (side) =>
    `<circle cx="2.6" cy="${side * 2.7}" r="1.7" fill="${t.eye}"/><circle cx="3.2" cy="${side * 2.7}" r="0.85" fill="${t.pupil}"/>`;
  return `<path class="tg" d="M8.5 0L11.6 0L13 1.5M11.6 0L13 -1.5" fill="none" stroke="${t.tongue}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>
<ellipse cx="1.5" cy="0" rx="7" ry="5.6" fill="${t.head}"/>
<ellipse cx="4.6" cy="0" rx="2.6" ry="2" fill="${t.snake}"/>
${eye(-1)}${eye(1)}`;
}

export function renderSnake(grid, plan, { themeName, login }) {
  const t = THEMES[themeName];
  if (!t) throw new Error(`Unknown theme: ${themeName}`);

  const { fadeStart, total } = timing(plan.steps);
  const width = MARGIN * 2 + grid.columns * PITCH - (PITCH - CELL);
  // The progress bar sits under the ring the snake roams, spanning the grid's width.
  const barX = MARGIN;
  const barY = MARGIN + (ROWS + 1) * PITCH + BAR_GAP;
  const barWidth = grid.columns * PITCH - (PITCH - CELL);
  const height = barY + BAR_HEIGHT + MARGIN - PITCH;
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

  // Like snk's stack: each meal drops a slice of its colour onto the bar, in eating order.
  const slice = plan.eaten.length ? barWidth / plan.eaten.length : 0;
  const bar = plan.eaten.map((meal, i) => {
    const name = `b${i}`;
    const shown = (meal.step - 0.5) * STEP_MS;
    rules.push(`@keyframes ${name}{0%,${pct(shown, total)}{opacity:0}${pct(shown + 1, total)},100%{opacity:1}}`);
    // Each slice overlaps the next by half a pixel so no seams show between them.
    const w = i === plan.eaten.length - 1 ? slice : slice + 0.5;
    return `<rect class="b" style="animation-name:${name}" x="${Number((barX + i * slice).toFixed(2))}" y="${barY}" width="${Number(w.toFixed(2))}" height="${BAR_HEIGHT}" fill="${t.levels[meal.level - 1]}"/>`;
  });

  // Tail tip, wider tail, body; the stripe reuses the body's keyframes.
  const pieces = segments({ head: 0, length: 1 }).map((_, i) => (frame) => segments(frame)[i]);
  const body = pieces.length - 1;
  const d = routePath(plan.route);
  const widths = [...TAPER, BODY_WIDTH];
  const strokes = widths.map((w, i) => `<path class="s" style="animation-name:s${i}" d="${d}" fill="none" stroke="${t.snake}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  strokes.push(`<path class="s" style="animation-name:s${body}" d="${d}" fill="none" stroke="${t.stripe}" stroke-width="${STRIPE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`);
  const head = `<g class="hd">${headShape(t)}</g>`;

  const title = `Snake eating ${login}'s contribution graph, faintest days first, growing from ${plan.startLength} to ${plan.finalLength} segments as it eats each active day`;
  const duration = `${total}ms`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
<title id="title">${escapeXml(title)}</title>
<style>
.c{animation:${duration} linear infinite}
.b{opacity:0;animation:${duration} linear infinite}
.g{opacity:0;animation:fade ${duration} linear infinite}
.s{animation:${duration} linear infinite}
.hd{animation:hd ${duration} linear infinite}
.tg{opacity:0;animation:tg 1.6s linear infinite}
@keyframes hd{${headKeyframes(plan, total)}}
@keyframes tg{0%,55%{opacity:0}58%,72%{opacity:1}75%,100%{opacity:0}}
@keyframes fade{0%{opacity:0}${pct(FADE_IN_MS, total)},${pct(fadeStart, total)}{opacity:1}100%{opacity:0}}
${pieces.map((pick, i) => `@keyframes s${i}{${dashKeyframes(plan, total, pick)}}`).join("\n")}
${rules.join("\n")}
@media (prefers-reduced-motion: reduce){.c,.g,.s,.b,.hd,.tg{animation:none}}
</style>
${rects.join("\n")}
<clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barWidth}" height="${BAR_HEIGHT}" rx="2"/></clipPath>
<rect x="${barX}" y="${barY}" width="${barWidth}" height="${BAR_HEIGHT}" rx="2" fill="${t.empty}"/>
<g class="g" clip-path="url(#bar)">${bar.join("")}</g>
<g class="g">
${strokes.join("\n")}
${head}
</g>
</svg>
`;
}
