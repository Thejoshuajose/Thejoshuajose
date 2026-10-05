import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, inBounds, initialBody, planRun, planWithCap, ROWS } from "../scripts/snake/plan.mjs";
import { headMotion, renderSnake, routePath, segments, TAPER, timing } from "../scripts/snake/render.mjs";
import { buildSnakes, fetchCalendar, main } from "../scripts/snake/generate.mjs";

const LEVEL_NAMES = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];

// levels[x][y] -> calendar shape returned by the GraphQL API.
function calendarFrom(levels) {
  return { weeks: levels.map((week) => ({ contributionDays: week.map((level, weekday) => ({ weekday, contributionLevel: LEVEL_NAMES[level] })) })) };
}

const full = (fill) => Array.from({ length: ROWS }, (_, y) => fill(y));

test("buildGrid maps weeks to columns and weekdays to rows", () => {
  const grid = buildGrid(calendarFrom([full(() => 0), [2, 0, 4]]));
  assert.equal(grid.columns, 2);
  assert.equal(grid.cells.length, ROWS + 3);
  assert.deepEqual(grid.cells.find((c) => c.x === 1 && c.y === 2), { x: 1, y: 2, level: 4 });
});

test("buildGrid rejects malformed calendars loudly", () => {
  assert.throws(() => buildGrid(undefined), /no weeks/);
  assert.throws(() => buildGrid({ weeks: [] }), /no weeks/);
  assert.throws(() => buildGrid({ weeks: Array.from({ length: 55 }, () => ({ contributionDays: [] })) }), /at most 54/);
  assert.throws(() => buildGrid({ weeks: [{}] }), /no contributionDays/);
  assert.throws(() => buildGrid({ weeks: [{ contributionDays: [{ weekday: 7, contributionLevel: "NONE" }] }] }), /Invalid weekday/);
  assert.throws(() => buildGrid({ weeks: [{ contributionDays: [{ weekday: 1, contributionLevel: "toString" }] }] }), /Unknown contribution level/);
  const dup = { weekday: 0, contributionLevel: "NONE" };
  assert.throws(() => buildGrid({ weeks: [{ contributionDays: [dup, dup] }] }), /Duplicate day/);
});

// Replays a plan and checks every rule the animation relies on.
function assertValidRun(grid, plan) {
  const { route, frames } = plan;
  for (let i = 1; i < route.length; i += 1) {
    assert.equal(Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y), 1, `step ${i} is not adjacent`);
    assert.ok(inBounds(grid.columns, route[i]), `step ${i} leaves the field`);
  }
  for (let i = 0; i < frames.length; i += 1) {
    const { head, length } = frames[i];
    assert.ok(head - length + 1 >= 0, "tail must stay on the route");
    const body = route.slice(head - length + 1, head + 1).map((p) => `${p.x},${p.y}`);
    assert.equal(new Set(body).size, body.length, `snake overlaps itself at frame ${i}`);
    if (i > 0) {
      const ate = plan.eaten.some((e) => e.step === i);
      assert.ok(length - frames[i - 1].length === (ate && length > frames[i - 1].length ? 1 : 0), `frame ${i} grows without eating`);
    }
  }
  const food = grid.cells.filter((c) => c.level > 0).map((c) => `${c.x},${c.y}`).sort();
  assert.deepEqual(plan.eaten.map((e) => `${e.x},${e.y}`).sort(), food, "every active day is eaten exactly once");
}

test("snake starts coiled in the left ring with its head at the top", () => {
  assert.deepEqual(initialBody(3), [{ x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }]);
});

test("snake grows by exactly one segment per active day and never overlaps itself", () => {
  const levels = [full((y) => (y === 3 ? 1 : 0)), full(() => 4), full((y) => y % 3), full(() => 0), full((y) => (y > 4 ? 2 : 0))];
  const grid = buildGrid(calendarFrom(levels));
  const plan = planRun(grid, { startLength: 3 });
  assertValidRun(grid, plan);
  const meals = grid.cells.filter((c) => c.level > 0).length;
  assert.equal(plan.finalLength, 3 + meals);
});

test("snake hunts the faintest cells first, like snk", () => {
  const grid = buildGrid(calendarFrom([full((y) => (y === 0 ? 4 : 0)), full(() => 0), full((y) => (y === 6 ? 1 : 0))]));
  const plan = planRun(grid);
  // The level-4 cell is right beside the start; the level-1 cell is across the grid, yet it goes first.
  assert.deepEqual(plan.eaten.map((e) => e.level), [1, 4]);
});

test("a year with every day active still clears the grid without collisions", () => {
  const grid = buildGrid(calendarFrom(Array.from({ length: 53 }, () => full((y) => 1 + ((y * 7) % 4)))));
  const plan = planRun(grid);
  assertValidRun(grid, plan);
  assert.ok(plan.finalLength > 3, "it still grows");
});

test("growth cap stops lengthening but the snake keeps eating", () => {
  const grid = buildGrid(calendarFrom([full(() => 2), full(() => 2)]));
  const plan = planWithCap(grid, { startLength: 3, maxLength: 6 });
  assertValidRun(grid, plan);
  assert.equal(plan.finalLength, 6);
  assert.equal(plan.eaten.length, 2 * ROWS);
});

test("an empty year still crosses the grid without growing", () => {
  const plan = planRun(buildGrid(calendarFrom([full(() => 0)])));
  assert.equal(plan.eaten.length, 0);
  assert.equal(plan.finalLength, plan.startLength);
});

test("planRun rejects nonsense start lengths", () => {
  const grid = buildGrid(calendarFrom([full(() => 0)]));
  for (const startLength of [0, -1, 1.5, "3", ROWS + 3]) assert.throws(() => planRun(grid, { startLength }), /startLength must be an integer/);
});

test("routePath keeps only corners and never drops a reversal", () => {
  assert.equal(routePath([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }]), "M23 23L23 47L35 47");
  assert.equal(routePath([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }]), "M23 23L23 35L23 23");
});

function parseGrow(svg, piece = TAPER.length) {
  const body = svg.match(new RegExp(`@keyframes s${piece}\\{(.*?)\\}\\}`))[1] + "}";
  return [...body.matchAll(/([\d.]+)%\{stroke-dasharray:([\d.]+)px ([\d.]+)px;stroke-dashoffset:(-?[\d.]+)px\}/g)].map((m) => ({
    at: Number(m[1]),
    dash: Number(m[2]),
    gap: Number(m[3]),
    offset: Number(m[4]),
  }));
}

test("rendered snake body only lengthens, never moves backwards, and ends at its final length", () => {
  const levels = [full((y) => y % 2), full(() => 2), full((y) => (y === 6 ? 3 : 0))];
  const grid = buildGrid(calendarFrom(levels));
  const plan = planRun(grid);
  const keys = parseGrow(renderSnake(grid, plan, { themeName: "dark", login: "someone" }));

  assert.equal(keys[0].at, 0);
  assert.equal(keys.at(-1).at, 100);
  // The body starts where the tapered tail ends.
  assert.equal(keys[0].dash, (plan.startLength - 1 - TAPER.length) * 12);
  assert.equal(keys.at(-1).dash, (plan.finalLength - 1 - TAPER.length) * 12);
  for (let i = 1; i < keys.length; i += 1) {
    assert.ok(keys[i].at >= keys[i - 1].at, "keyframes are ordered");
    assert.ok(keys[i].dash >= keys[i - 1].dash, "body never shrinks");
    assert.ok(keys[i].offset <= keys[i - 1].offset, "tail never retreats");
    assert.ok(keys[i].gap >= plan.route.length * 12 - 12, "gap outlasts the path so the dash never repeats");
  }
  // Head position (tail + body) must reach the end of the route.
  const last = keys.at(-1);
  assert.equal(-last.offset + last.dash, (plan.route.length - 1) * 12);
});

test("each eaten cell disappears and returns; empty cells are never animated", () => {
  const levels = [full((y) => (y < 2 ? 4 : 0))];
  const grid = buildGrid(calendarFrom(levels));
  const svg = renderSnake(grid, planRun(grid), { themeName: "light", login: "someone" });
  assert.equal((svg.match(/class="c"/g) ?? []).length, 2);
  assert.match(svg, /@keyframes e0_0\{0%,[\d.]+%\{fill:#216E39\}[\d.]+%,[\d.]+%\{fill:#EBEDF0\}100%\{fill:#216E39\}\}/);
  assert.equal((svg.match(/<rect [^>]*width="10" height="10"/g) ?? []).length, ROWS, "one cell per day");
});

test("render respects reduced motion, escapes the login and rejects unknown themes", () => {
  const grid = buildGrid(calendarFrom([full(() => 1)]));
  const plan = planRun(grid);
  const svg = renderSnake(grid, plan, { themeName: "dark", login: `<x>"` });
  assert.match(svg, /@media \(prefers-reduced-motion: reduce\)\{\.c,\.g,\.s,\.b\{animation:none\}\}/);
  assert.match(svg, /\.g\{opacity:0;/, "snake is hidden when animations are off");
  assert.ok(svg.includes("&lt;x&gt;&quot;"));
  assert.ok(!svg.includes("<x>"));
  assert.match(svg, /growing from 3 to 10 segments/);
  assert.throws(() => renderSnake(grid, plan, { themeName: "neon", login: "a" }), /Unknown theme/);
});

test("timing covers the walk, a pause, and the fade", () => {
  assert.deepEqual(timing(10), { move: 900, fadeStart: 2900, total: 3700 });
});

test("buildSnakes writes light and dark files under the names the README uses", () => {
  const { files, plan } = buildSnakes(calendarFrom([full(() => 1), [0, 3]]), "someone");
  assert.deepEqual(Object.keys(files).sort(), ["github-contribution-grid-snake-dark.svg", "github-contribution-grid-snake.svg"]);
  assert.equal(plan.finalLength, plan.startLength + ROWS + 1);
  assert.ok(files["github-contribution-grid-snake-dark.svg"].includes("#161B22"));
  assert.ok(files["github-contribution-grid-snake.svg"].includes("#EBEDF0"));
});

test("fetchCalendar validates the login and reports missing users", async () => {
  const calendar = calendarFrom([full(() => 0)]);
  let seen;
  const query = async (_text, variables) => {
    seen = variables;
    return variables.login === "ghost" ? { user: null } : { user: { contributionsCollection: { contributionCalendar: calendar } } };
  };
  assert.equal(await fetchCalendar(query, "someone"), calendar);
  assert.deepEqual(seen, { login: "someone" });
  await assert.rejects(fetchCalendar(query, "ghost"), /user not found/);
  await assert.rejects(fetchCalendar(query, "bad name"), /Invalid GitHub username/);
});

test("main rejects bad usernames, escaping output paths and a missing token", async () => {
  await assert.rejects(main(["--user", "bad name"], { GITHUB_TOKEN: "t" }), /Invalid GitHub username/);
  await assert.rejects(main(["--user", "ok", "--out", "../../escape"], { GITHUB_TOKEN: "t" }), /inside the working directory/);
  await assert.rejects(main(["--user", "ok", "--out", "dist"], {}), /token is required/);
});

test("progress bar gets one slice per meal, in eating order, coloured by level", () => {
  const grid = buildGrid(calendarFrom([full((y) => (y === 0 ? 4 : 0)), full(() => 0), full((y) => (y === 6 ? 1 : 0))]));
  const plan = planRun(grid);
  const svg = renderSnake(grid, plan, { themeName: "dark", login: "someone" });
  const slices = [...svg.matchAll(/<rect class="b" style="animation-name:(b\d+)" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*fill="(#[0-9A-F]+)"\/>/g)];
  assert.equal(slices.length, 2);
  // Faintest first: the level-1 cell is eaten first, so its colour leads the bar.
  assert.deepEqual(slices.map((m) => m[4]), ["#0E4429", "#39D353"]);
  const barWidth = Number(svg.match(/<clipPath id="bar"><rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"/)[1]);
  assert.ok(Math.abs(Number(slices[1][2]) + Number(slices[1][3]) - (Number(slices[0][2]) + barWidth)) < 0.01, "slices span the bar exactly");
  // A slice appears only once its cell has been eaten.
  const { total } = timing(plan.steps);
  const shownAt = Number(svg.match(/@keyframes b0\{0%,([\d.]+)%\{opacity:0\}/)[1]);
  assert.ok(Math.abs(shownAt - ((plan.eaten[0].step - 0.5) * 90 * 100) / total) < 0.001);
  assert.match(svg, /\{\.c,\.g,\.s,\.b\{animation:none\}\}/);
});

test("progress bar is an empty track when nothing was eaten", () => {
  const grid = buildGrid(calendarFrom([full(() => 0)]));
  const svg = renderSnake(grid, planRun(grid), { themeName: "light", login: "someone" });
  assert.equal((svg.match(/class="b"/g) ?? []).length, 0);
  assert.match(svg, /<clipPath id="bar">/);
});

test("segments split the snake into a tapered tail and a body that meet end to end", () => {
  assert.deepEqual(segments({ head: 10, length: 6 }), [
    { from: 5, to: 6 },
    { from: 6, to: 7 },
    { from: 7, to: 10 },
  ]);
  // Shorter than the taper: pieces collapse onto the head instead of running ahead of it.
  assert.deepEqual(segments({ head: 4, length: 2 }), [
    { from: 3, to: 4 },
    { from: 4, to: 4 },
    { from: 4, to: 4 },
  ]);
  assert.deepEqual(segments({ head: 0, length: 1 }), [
    { from: 0, to: 0 },
    { from: 0, to: 0 },
    { from: 0, to: 0 },
  ]);
});

test("rendered tail pieces stay joined to the body in every keyframe", () => {
  const grid = buildGrid(calendarFrom([full((y) => y % 2), full(() => 2), full((y) => (y === 6 ? 3 : 0))]));
  const plan = planRun(grid);
  const svg = renderSnake(grid, plan, { themeName: "dark", login: "someone" });
  const pieces = [0, 1, 2].map((i) => parseGrow(svg, i));
  assert.equal(new Set(pieces.map((k) => k.length)).size, 1, "all pieces share keyframe times");
  pieces[0].forEach((_, j) => {
    for (let i = 0; i < 2; i += 1) {
      const a = pieces[i][j];
      const b = pieces[i + 1][j];
      assert.equal(a.at, b.at);
      assert.ok(a.dash <= 12, "taper pieces are one step long");
      assert.equal(-a.offset + a.dash, -b.offset, "each piece ends where the next starts");
    }
  });
  assert.equal((svg.match(/class="s"/g) ?? []).length, 4, "tail tip, tail, body and dorsal stripe");
});

test("head rides the route to its end, turning with it, then waits", () => {
  const grid = buildGrid(calendarFrom([full((y) => (y < 3 ? 1 : 0))]));
  const plan = planRun(grid);
  const { total, move } = timing(plan.steps);
  const motion = headMotion(plan, total);
  const [from, to, hold] = motion.keyPoints.split(";").map(Number);
  assert.ok(Math.abs(from - (plan.startLength - 1) / (plan.route.length - 1)) < 1e-6);
  assert.equal(to, 1);
  assert.equal(hold, 1);
  assert.equal(motion.keyTimes, `0;${Number((move / total).toFixed(6))};1`);
  const svg = renderSnake(grid, plan, { themeName: "dark", login: "someone" });
  assert.match(svg, /<animateMotion path="M[^"]+" dur="\d+ms" repeatCount="indefinite" rotate="auto" calcMode="linear"/);
  assert.equal((svg.match(/fill="#F0F6FC"/g) ?? []).length, 2, "two eyes");
});

test("head stays put when there is nothing to eat and has no motion on a one-cell route", () => {
  const grid = buildGrid(calendarFrom([full(() => 0)]));
  const plan = planRun(grid);
  assert.equal(plan.steps, 0);
  assert.deepEqual(headMotion(plan, timing(0).total), { keyPoints: "1;1", keyTimes: "0;1" });
  const tiny = planWithCap(grid, { startLength: 1 });
  assert.equal(headMotion(tiny, timing(0).total), null);
  assert.ok(!renderSnake(grid, tiny, { themeName: "light", login: "a" }).includes("animateMotion"));
});
