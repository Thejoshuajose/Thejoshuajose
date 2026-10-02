// Pure maths for the contribution snake: calendar -> grid -> route -> growth timeline.
//
// The route is a boustrophedon (down one week, up the next), so it never revisits a cell. The
// body only ever lies on cells the head has already passed, which means the snake can grow
// without limit and still never collide with itself.

export const LEVELS = Object.freeze({
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
});

export const ROWS = 7;
const MAX_WEEKS = 54;

export function buildGrid(calendar) {
  const weeks = calendar?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) throw new Error("Contribution calendar has no weeks");
  if (weeks.length > MAX_WEEKS) throw new Error(`Contribution calendar has ${weeks.length} weeks; expected at most ${MAX_WEEKS}`);

  const cells = [];
  const seen = new Set();
  weeks.forEach((week, x) => {
    const days = week?.contributionDays;
    if (!Array.isArray(days)) throw new Error(`Week ${x} has no contributionDays`);
    for (const day of days) {
      const y = day?.weekday;
      if (!Number.isInteger(y) || y < 0 || y >= ROWS) throw new Error(`Invalid weekday ${JSON.stringify(y)} in week ${x}`);
      if (!Object.hasOwn(LEVELS, day.contributionLevel)) {
        throw new Error(`Unknown contribution level ${JSON.stringify(day.contributionLevel)} on ${day.date}`);
      }
      const key = `${x},${y}`;
      if (seen.has(key)) throw new Error(`Duplicate day for week ${x}, weekday ${y}`);
      seen.add(key);
      cells.push({ x, y, level: LEVELS[day.contributionLevel] });
    }
  });
  return { columns: weeks.length, cells };
}

export function buildRoute(columns, startLength) {
  const route = [];
  // The starting body waits above the first column, outside the drawn grid.
  for (let i = startLength; i >= 1; i -= 1) route.push({ x: 0, y: -i });
  for (let x = 0; x < columns; x += 1) {
    for (let r = 0; r < ROWS; r += 1) route.push({ x, y: x % 2 === 0 ? r : ROWS - 1 - r });
  }
  return route;
}

// Head index h walks the route; the body covers route[h - length + 1 .. h]. Each food cell the
// head enters adds one segment, so the tail holds still for that step.
export function planRun(grid, { startLength = 3 } = {}) {
  if (!Number.isInteger(startLength) || startLength < 1) throw new Error(`startLength must be a positive integer, got ${startLength}`);

  const route = buildRoute(grid.columns, startLength);
  const food = new Map(grid.cells.filter((c) => c.level > 0).map((c) => [`${c.x},${c.y}`, c]));

  const firstHead = startLength - 1;
  const frames = [{ head: firstHead, length: startLength }];
  const eaten = [];
  let length = startLength;
  for (let h = firstHead + 1; h < route.length; h += 1) {
    const cell = food.get(`${route[h].x},${route[h].y}`);
    if (cell) {
      length += 1;
      eaten.push({ ...cell, step: h - firstHead });
    }
    frames.push({ head: h, length });
  }

  return { route, frames, eaten, steps: route.length - 1 - firstHead, startLength, finalLength: length };
}
