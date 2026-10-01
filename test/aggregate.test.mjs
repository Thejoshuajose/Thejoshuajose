import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateLanguages, computeStreaks, summarizeActivity } from "../scripts/stats/aggregate.mjs";

const repo = (...langs) => ({
  languages: { edges: langs.map(([name, size, color = "#123456"]) => ({ size, node: { name, color } })) },
});

const days = (spec) => Object.entries(spec).map(([date, contributionCount]) => ({ date, contributionCount }));

test("aggregateLanguages sums bytes across repos and sorts by size", () => {
  const result = aggregateLanguages([repo(["C#", 600], ["TypeScript", 100]), repo(["TypeScript", 300])]);
  assert.deepEqual(result.map((l) => [l.name, l.size]), [["C#", 600], ["TypeScript", 400]]);
  assert.equal(result[0].percent, 60);
  assert.equal(result[1].percent, 40);
});

test("aggregateLanguages excludes markup and folds the tail into Other", () => {
  const result = aggregateLanguages(
    [repo(["HTML", 10_000], ["CSS", 5_000], ["Python", 50], ["Go", 30], ["Rust", 20])],
    { limit: 1 },
  );
  assert.deepEqual(result.map((l) => l.name), ["Python", "Other"]);
  assert.equal(result[1].size, 50);
  assert.equal(result.reduce((sum, l) => sum + l.percent, 0), 100);
});

test("aggregateLanguages rejects bad colors and ignores malformed edges", () => {
  const result = aggregateLanguages([
    repo(["Python", 10, "red;stroke:url(javascript:alert(1))"]),
    { languages: { edges: [null, { size: -5, node: { name: "Go" } }, { size: 5, node: {} }] } },
    {},
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].color, "#8B949E");
});

test("aggregateLanguages returns empty for no data and validates input", () => {
  assert.deepEqual(aggregateLanguages([]), []);
  assert.throws(() => aggregateLanguages(null), TypeError);
  assert.throws(() => aggregateLanguages([], { limit: 0 }), RangeError);
});

test("computeStreaks finds current and longest runs", () => {
  const result = computeStreaks(
    days({
      "2026-01-01": 1, "2026-01-02": 2, "2026-01-03": 1, "2026-01-04": 0,
      "2026-01-05": 3, "2026-01-06": 1,
    }),
  );
  assert.deepEqual(result.longest, { length: 3, start: "2026-01-01", end: "2026-01-03" });
  assert.deepEqual(result.current, { length: 2, start: "2026-01-05", end: "2026-01-06" });
});

test("computeStreaks keeps the streak alive when today has no contributions yet", () => {
  const result = computeStreaks(days({ "2026-03-01": 1, "2026-03-02": 1, "2026-03-03": 0 }));
  assert.equal(result.current.length, 2);
  assert.equal(result.current.end, "2026-03-02");
});

test("computeStreaks resets when yesterday and today are both empty", () => {
  const result = computeStreaks(days({ "2026-03-01": 4, "2026-03-02": 0, "2026-03-03": 0 }));
  assert.equal(result.current.length, 0);
  assert.equal(result.longest.length, 1);
});

test("computeStreaks bridges year boundaries and tolerates unsorted, duplicate and invalid days", () => {
  const result = computeStreaks([
    { date: "2026-01-01", contributionCount: 1 },
    { date: "2025-12-31", contributionCount: 1 },
    { date: "2025-12-31", contributionCount: 0 },
    { date: "not-a-date", contributionCount: 9 },
  ]);
  assert.deepEqual(result.current, { length: 2, start: "2025-12-31", end: "2026-01-01" });
});

test("computeStreaks does not join runs across missing dates", () => {
  const result = computeStreaks(days({ "2026-05-01": 1, "2026-05-03": 1 }));
  assert.equal(result.longest.length, 1);
  assert.equal(result.current.length, 1);
});

test("computeStreaks handles empty input", () => {
  const result = computeStreaks([]);
  assert.equal(result.current.length, 0);
  assert.equal(result.longest.start, null);
  assert.throws(() => computeStreaks("x"), TypeError);
});

test("summarizeActivity totals years and reads current-year numbers", () => {
  const calendar = (total, spec) => ({ totalContributions: total, weeks: [{ contributionDays: days(spec) }] });
  const summary = summarizeActivity(
    [
      { year: 2025, collection: { contributionCalendar: calendar(80, { "2025-12-31": 2 }) } },
      { year: 2026, collection: { contributionCalendar: calendar(40, { "2026-01-01": 1, "2026-01-02": 0, "2026-01-03": 5 }) } },
    ],
    2026,
  );
  assert.equal(summary.totalContributions, 120);
  assert.equal(summary.contributionsThisYear, 40);
  assert.equal(summary.activeDaysThisYear, 2);
  assert.equal(summary.streaks.current.length, 1);
  assert.equal(summary.streaks.longest.length, 2);
});

test("summarizeActivity fails loudly on malformed input", () => {
  assert.throws(() => summarizeActivity([], 2026), TypeError);
  assert.throws(() => summarizeActivity([{ year: 2026, collection: {} }], 2026), /missing contribution calendar/);
});
