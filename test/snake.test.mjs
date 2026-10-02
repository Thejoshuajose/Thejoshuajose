import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, buildRoute, planRun, ROWS } from "../scripts/snake/plan.mjs";
import { renderSnake, routePath, timing } from "../scripts/snake/render.mjs";
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

test("route snakes down even weeks and up odd weeks without revisiting a cell", () => {
  const route = buildRoute(3, 2);
  assert.deepEqual(route.slice(0, 3), [{ x: 0, y: -2 }, { x: 0, y: -1 }, { x: 0, y: 0 }]);
  assert.deepEqual(route[2 + ROWS], { x: 1, y: ROWS - 1 });
  assert.deepEqual(route.at(-1), { x: 2, y: ROWS - 1 });
  assert.equal(new Set(route.map((p) => `${p.x},${p.y}`)).size, route.length);
  for (let i = 1; i < route.length; i += 1) {
    assert.equal(Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y), 1, `step ${i} is not adjacent`);
  }
});

test("snake grows by exactly one segment per active day it eats", () => {
  const levels = [full((y) => (y === 3 ? 1 : 0)), full(() => 4), full(() => 0)];
  const plan = planRun(buildGrid(calendarFrom(levels)), { startLength: 3 });

  assert.equal(plan.eaten.length, 1 + ROWS);
  assert.equal(plan.finalLength, 3 + 1 + ROWS);
  assert.equal(plan.steps, 3 * ROWS);
  for (let i = 1; i < plan.frames.length; i += 1) {
    const { head, length } = plan.frames[i];
    const ate = plan.eaten.some((e) => e.step === i);
    assert.equal(length - plan.frames[i - 1].length, ate ? 1 : 0, `frame ${i}`);
    assert.ok(head - length + 1 >= 0, "tail must stay on the route");
  }
  // The first meal is week 0, weekday 3: the fourth grid cell after the three waiting segments.
  assert.deepEqual(plan.eaten[0], { x: 0, y: 3, level: 1, step: 4 });
});

test("an empty year still crosses the grid without growing", () => {
  const plan = planRun(buildGrid(calendarFrom([full(() => 0)])));
  assert.equal(plan.eaten.length, 0);
  assert.equal(plan.finalLength, plan.startLength);
});

test("planRun rejects nonsense start lengths", () => {
  const grid = buildGrid(calendarFrom([full(() => 0)]));
  for (const startLength of [0, -1, 1.5, "3"]) assert.throws(() => planRun(grid, { startLength }), /positive integer/);
});

test("routePath keeps only corners", () => {
  assert.equal(routePath([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }]), "M11 11L11 35L23 35");
});

function parseGrow(svg) {
  const body = svg.match(/@keyframes grow\{(.*?)\}\}/)[1] + "}";
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
  assert.equal(keys[0].dash, (plan.startLength - 1) * 12);
  assert.equal(keys.at(-1).dash, (plan.finalLength - 1) * 12);
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
  assert.equal((svg.match(/<rect /g) ?? []).length, ROWS);
});

test("render respects reduced motion, escapes the login and rejects unknown themes", () => {
  const grid = buildGrid(calendarFrom([full(() => 1)]));
  const plan = planRun(grid);
  const svg = renderSnake(grid, plan, { themeName: "dark", login: `<x>"` });
  assert.match(svg, /@media \(prefers-reduced-motion: reduce\)\{\.c,\.g,\.s\{animation:none\}\}/);
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
