import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeXml, formatDate, formatNumber, rangeLabel, renderActivityCard, renderLanguagesCard } from "../scripts/stats/render.mjs";
import { buildCards, main } from "../scripts/stats/generate.mjs";

const summary = {
  totalContributions: 12345,
  contributionsThisYear: 2100,
  activeDaysThisYear: 180,
  streaks: {
    current: { length: 12, start: "2026-09-20", end: "2026-10-01" },
    longest: { length: 40, start: "2026-03-01", end: "2026-04-09" },
  },
};

test("escapeXml neutralises markup", () => {
  assert.equal(escapeXml(`<script>"a" & 'b'</script>`), "&lt;script&gt;&quot;a&quot; &amp; &apos;b&apos;&lt;/script&gt;");
});

test("formatters handle normal and degenerate values", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
  assert.equal(formatNumber(-3), "0");
  assert.equal(formatNumber("nope"), "0");
  assert.equal(formatDate("2026-10-01"), "Oct 1, 2026");
  assert.equal(formatDate(null), "");
  assert.equal(formatDate("garbage"), "");
});

test("rangeLabel stays compact for single days, same-year and cross-year ranges", () => {
  assert.equal(rangeLabel({ length: 1, start: "2026-10-01", end: "2026-10-01" }), "Oct 1, 2026");
  assert.equal(rangeLabel({ length: 3, start: "2026-08-10", end: "2026-08-12" }), "Aug 10 – Aug 12, 2026");
  assert.equal(rangeLabel({ length: 9, start: "2025-12-30", end: "2026-01-07" }), "Dec 30 '25 – Jan 7 '26");
  assert.equal(rangeLabel({ length: 0, start: null, end: null }), "No active streak");
});

test("activity card shows each metric and an accessible title", () => {
  const svg = renderActivityCard(summary, { themeName: "dark", currentYear: 2026, scopeLabel: "public + private" });
  assert.match(svg, /^<svg[^>]+role="img"/);
  assert.match(svg, /<title id="title">Development activity: 12,345 total contributions, current streak 12 days, longest streak 40 days<\/title>/);
  for (const text of ["12,345", "2,100", "180", "Active days", "12d", "40d", "Sep 20 – Oct 1, 2026", "public + private"]) {
    assert.ok(svg.includes(text), text);
  }
});

test("activity card renders an empty streak without dates", () => {
  const svg = renderActivityCard(
    { ...summary, streaks: { current: { length: 0, start: null, end: null }, longest: { length: 0, start: null, end: null } } },
    { themeName: "light", currentYear: 2026, scopeLabel: "public repositories" },
  );
  assert.ok(svg.includes("No active streak"));
  assert.ok(svg.includes('fill="#F6F8FA"'), "light surface colour");
});

test("languages card escapes names and includes a composition disclaimer", () => {
  const svg = renderLanguagesCard(
    [
      { name: "C#", color: "#178600", percent: 70 },
      { name: "<b>evil</b>", color: "#3178C6", percent: 30 },
    ],
    { themeName: "dark", repoCount: 31, scopeLabel: "public + private" },
  );
  assert.ok(svg.includes("C#"));
  assert.ok(svg.includes("&lt;b&gt;evil&lt;/b&gt;"));
  assert.ok(!svg.includes("<b>"));
  assert.ok(svg.includes("70.0%"));
  assert.ok(svg.includes("across 31 owned repositories"));
  assert.ok(svg.includes("composition, not proficiency"));
});

test("languages card renders an empty state", () => {
  const svg = renderLanguagesCard([], { themeName: "dark", repoCount: 0, scopeLabel: "public repositories" });
  assert.ok(svg.includes("No language data available yet."));
});

test("unknown themes fail loudly", () => {
  assert.throws(() => renderActivityCard(summary, { themeName: "neon", currentYear: 2026, scopeLabel: "" }), /Unknown theme/);
});

test("buildCards produces dark and light variants and labels scope honestly", () => {
  const calendar = { totalContributions: 5, weeks: [{ contributionDays: [{ date: "2026-10-01", contributionCount: 5 }] }] };
  const data = {
    repos: [{ isPrivate: false, languages: { edges: [{ size: 10, node: { name: "Python", color: "#3572A5" } }] } }],
    repoCount: 1,
    years: [{ year: 2026, collection: { contributionCalendar: calendar } }],
    currentYear: 2026,
  };
  const files = buildCards(data);
  assert.deepEqual(Object.keys(files).sort(), ["activity-dark.svg", "activity.svg", "languages-dark.svg", "languages.svg"]);
  assert.ok(files["activity-dark.svg"].includes("public repositories"));

  data.repos.push({ isPrivate: true, languages: { edges: [] } });
  assert.ok(buildCards(data)["languages.svg"].includes("public + private"));
});

test("main rejects bad usernames and output paths outside the working directory", async () => {
  await assert.rejects(main(["--user", "bad name"], { GITHUB_TOKEN: "t" }), /Invalid GitHub username/);
  await assert.rejects(main(["--user", "ok", "--out", "../../escape"], { GITHUB_TOKEN: "t" }), /inside the working directory/);
  await assert.rejects(main(["--user", "ok", "--out", "dist"], {}), /token is required/);
});
