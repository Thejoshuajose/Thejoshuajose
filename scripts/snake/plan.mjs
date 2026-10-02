// Pure maths for the contribution snake: calendar -> grid -> route -> growth timeline.
//
// Movement mirrors Platane/snk: the snake hunts the faintest remaining cells first, nearest
// first, roaming through the grid and a one-cell ring around it. Unlike snk it grows a segment
// for every cell it eats, so each move is checked before it is taken: the path must not cross
// the body (whose cells free up as the tail advances), and once the food is eaten the head
// must still be able to reach its own tail, which guarantees the snake can never box itself in.

export const LEVELS = Object.freeze({
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
});

export const ROWS = 7;
const MAX_WEEKS = 54;
// If a long snake can't find a safe way to clear the grid, plan again with growth capped.
// The final cap equals startLength (no growth), which a short snake can always solve.
const GROWTH_CAPS = [Infinity, 120, 80, 50, 30, 15];
const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

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

const keyOf = (p) => `${p.x},${p.y}`;

// The playing field is the grid plus a one-cell ring, so the snake can slip around the edges.
export function inBounds(columns, p) {
  return p.x >= -1 && p.x <= columns && p.y >= -1 && p.y <= ROWS;
}

// Breadth-first search from the head that knows the body moves: the segment j places from the
// tail vacates its cell after j + 1 steps (assuming no growth on the way; simulate() checks).
function explore(columns, body) {
  const freeAt = new Map(body.map((p, j) => [keyOf(p), j + 1]));
  const head = body[body.length - 1];
  const dist = new Map([[keyOf(head), 0]]);
  const parent = new Map();
  const queue = [head];
  for (let i = 0; i < queue.length; i += 1) {
    const p = queue[i];
    const d = dist.get(keyOf(p)) + 1;
    for (const [dx, dy] of DIRECTIONS) {
      const n = { x: p.x + dx, y: p.y + dy };
      const k = keyOf(n);
      if (dist.has(k) || !inBounds(columns, n) || (freeAt.get(k) ?? 0) > d) continue;
      dist.set(k, d);
      parent.set(k, p);
      queue.push(n);
    }
  }
  return { dist, parent };
}

function pathTo(parent, target) {
  const path = [];
  for (let p = target; parent.has(keyOf(p)); p = parent.get(keyOf(p))) path.push(p);
  return path.reverse();
}

// Walks the body along a path for real, eating whatever it crosses. Returns null on collision.
function simulate(state, path, food, maxLength) {
  const body = state.body.slice();
  const occupied = new Set(body.map(keyOf));
  const eaten = new Set();
  const steps = [];
  for (const p of path) {
    const k = keyOf(p);
    const meal = food.has(k) && !state.eaten.has(k) && !eaten.has(k);
    const grows = meal && body.length < maxLength;
    if (!grows) occupied.delete(keyOf(body.shift()));
    if (occupied.has(k)) return null;
    body.push(p);
    occupied.add(k);
    if (meal) eaten.add(k);
    steps.push({ p, meal });
  }
  return { body, eaten, steps };
}

function canReachTail(columns, body) {
  return explore(columns, body).dist.has(keyOf(body[0]));
}

export function initialBody(startLength) {
  // Coiled in the left ring, head at the top corner, like snk's starting position.
  return Array.from({ length: startLength }, (_, i) => ({ x: -1, y: startLength - 2 - i }));
}

export function planWithCap(grid, { startLength = 3, maxLength = Infinity } = {}) {
  if (!Number.isInteger(startLength) || startLength < 1 || startLength > ROWS + 2) {
    throw new Error(`startLength must be an integer from 1 to ${ROWS + 2}, got ${startLength}`);
  }
  const { columns } = grid;
  const food = new Map(grid.cells.filter((c) => c.level > 0).map((c) => [keyOf(c), c]));
  const state = { body: initialBody(startLength), eaten: new Set() };
  const route = state.body.slice();
  const firstHead = route.length - 1;
  const frames = [{ head: firstHead, length: startLength }];
  const eaten = [];
  const maxSteps = 40 * (columns + 2) * (ROWS + 2);

  const commit = (sim) => {
    for (const { p, meal } of sim.steps) {
      route.push(p);
      if (meal) eaten.push({ ...food.get(keyOf(p)), step: route.length - 1 - firstHead });
      frames.push({ head: route.length - 1, length: frames[frames.length - 1].length + (meal && frames[frames.length - 1].length < maxLength ? 1 : 0) });
    }
    state.body = sim.body;
    for (const k of sim.eaten) state.eaten.add(k);
  };

  while (state.eaten.size < food.size) {
    if (route.length > maxSteps) throw new Error(`Snake could not clear the grid within ${maxSteps} steps`);
    const { dist, parent } = explore(columns, state.body);
    const remaining = [...food.values()].filter((c) => !state.eaten.has(keyOf(c)) && dist.has(keyOf(c)));
    remaining.sort((a, b) => a.level - b.level || dist.get(keyOf(a)) - dist.get(keyOf(b)) || a.x - b.x || a.y - b.y);

    let moved = false;
    for (const target of remaining) {
      const sim = simulate(state, pathTo(parent, target), food, maxLength);
      if (sim && canReachTail(columns, sim.body)) {
        commit(sim);
        moved = true;
        break;
      }
    }
    if (moved) continue;

    // No food is safe right now: take the single step that keeps the tail reachable while
    // staying as far from it as possible, which lets the body uncoil and open the board.
    const head = state.body[state.body.length - 1];
    let best = null;
    for (const [dx, dy] of DIRECTIONS) {
      const n = { x: head.x + dx, y: head.y + dy };
      if (!dist.has(keyOf(n)) || dist.get(keyOf(n)) !== 1) continue;
      const sim = simulate(state, [n], food, maxLength);
      if (!sim) continue;
      const after = explore(columns, sim.body).dist.get(keyOf(sim.body[0]));
      if (after !== undefined && (!best || after > best.after)) best = { sim, after };
    }
    if (!best) throw new Error("Snake trapped itself");
    commit(best.sim);
  }

  const finalLength = frames[frames.length - 1].length;
  return { route, frames, eaten, steps: route.length - 1 - firstHead, startLength, finalLength };
}

export function planRun(grid, { startLength = 3 } = {}) {
  for (const cap of GROWTH_CAPS) {
    try {
      return planWithCap(grid, { startLength, maxLength: Math.max(cap, startLength) });
    } catch (error) {
      if (/startLength/.test(error.message)) throw error;
    }
  }
  return planWithCap(grid, { startLength, maxLength: startLength });
}
