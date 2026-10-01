// Pure data shaping for the profile stat cards. No I/O here so every rule is unit-testable.

// Markup and build files inflate byte counts without saying anything about the code
// that was written, so they are left out of the language breakdown.
export const EXCLUDED_LANGUAGES = new Set([
  "HTML",
  "CSS",
  "SCSS",
  "Less",
  "Dockerfile",
  "Procfile",
  "Batchfile",
  "Makefile",
]);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = "#8B949E";

/**
 * Sum language bytes across repositories and return the top `limit` languages,
 * with the remainder folded into "Other". Percentages are of the counted total.
 */
export function aggregateLanguages(repos, { limit = 6, exclude = EXCLUDED_LANGUAGES } = {}) {
  if (!Array.isArray(repos)) throw new TypeError("repos must be an array");
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");

  const totals = new Map();
  for (const repo of repos) {
    for (const edge of repo?.languages?.edges ?? []) {
      const name = edge?.node?.name;
      const size = edge?.size;
      if (typeof name !== "string" || !name || exclude.has(name)) continue;
      if (!Number.isFinite(size) || size <= 0) continue;
      const current = totals.get(name) ?? { name, size: 0, color: FALLBACK_COLOR };
      current.size += size;
      if (HEX_COLOR.test(edge.node.color ?? "")) current.color = edge.node.color;
      totals.set(name, current);
    }
  }

  const sorted = [...totals.values()].sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  const total = sorted.reduce((sum, lang) => sum + lang.size, 0);
  if (total === 0) return [];

  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((sum, lang) => sum + lang.size, 0);
  if (rest > 0) top.push({ name: "Other", size: rest, color: FALLBACK_COLOR });

  return top.map((lang) => ({ ...lang, percent: (lang.size / total) * 100 }));
}

/**
 * Compute streaks from contribution days. The last day in the data is treated as
 * "today"; a zero on today does not break the streak because the day is not over.
 */
export function computeStreaks(days) {
  if (!Array.isArray(days)) throw new TypeError("days must be an array");

  const byDate = new Map();
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.date ?? "")) continue;
    const count = Number.isFinite(day.contributionCount) ? day.contributionCount : 0;
    byDate.set(day.date, (byDate.get(day.date) ?? 0) + count);
  }
  const sorted = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  const empty = { length: 0, start: null, end: null };
  if (sorted.length === 0) return { current: { ...empty }, longest: { ...empty } };

  let longest = { ...empty };
  let run = { ...empty };
  let previous = null;
  for (const [date, count] of sorted) {
    const consecutive = previous !== null && dayDiff(previous, date) === 1;
    if (count > 0) {
      run = consecutive && run.length > 0
        ? { length: run.length + 1, start: run.start, end: date }
        : { length: 1, start: date, end: date };
      if (run.length > longest.length) longest = { ...run };
    } else {
      run = { ...empty };
    }
    previous = date;
  }

  let current = { ...empty };
  let i = sorted.length - 1;
  if (sorted[i][1] === 0) i -= 1;
  for (; i >= 0 && sorted[i][1] > 0; i -= 1) {
    const [date] = sorted[i];
    if (current.length > 0 && dayDiff(date, current.start) !== 1) break;
    current = { length: current.length + 1, start: date, end: current.end ?? date };
  }

  return { current, longest };
}

function dayDiff(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Collapse per-year contribution collections into the headline numbers for the activity card. */
export function summarizeActivity(years, currentYear) {
  if (!Array.isArray(years) || years.length === 0) throw new TypeError("years must be a non-empty array");

  let totalContributions = 0;
  const days = [];
  let thisYear = null;
  for (const year of years) {
    const calendar = year?.collection?.contributionCalendar;
    if (!calendar) throw new TypeError(`missing contribution calendar for ${year?.year}`);
    totalContributions += calendar.totalContributions ?? 0;
    for (const week of calendar.weeks ?? []) days.push(...(week.contributionDays ?? []));
    if (year.year === currentYear) thisYear = year.collection;
  }

  // Private work arrives only as an aggregate "restricted" count with no per-type split,
  // so commit totals would understate it. Active days count every contribution type.
  const activeDays = new Set();
  for (const week of thisYear?.contributionCalendar?.weeks ?? []) {
    for (const day of week.contributionDays ?? []) {
      if (day?.contributionCount > 0 && typeof day.date === "string") activeDays.add(day.date);
    }
  }

  return {
    totalContributions,
    contributionsThisYear: thisYear?.contributionCalendar?.totalContributions ?? 0,
    activeDaysThisYear: activeDays.size,
    streaks: computeStreaks(days),
  };
}
