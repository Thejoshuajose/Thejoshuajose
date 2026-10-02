#!/usr/bin/env node
// Generates the contribution snake (light + dark) from the last year of the contribution calendar.
// Usage: node scripts/snake/generate.mjs --user <login> --out <dir>
// Token: GH_STATS_TOKEN (counts private contributions when the profile shows them) or GITHUB_TOKEN.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { assertLogin, createClient } from "../stats/github.mjs";
import { buildGrid, planRun } from "./plan.mjs";
import { renderSnake } from "./render.mjs";

const CALENDAR_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks { contributionDays { weekday contributionLevel } }
      }
    }
  }
}`;

export async function fetchCalendar(query, login) {
  assertLogin(login);
  const data = await query(CALENDAR_QUERY, { login });
  if (!data.user) throw new Error(`GitHub user not found: ${login}`);
  return data.user.contributionsCollection.contributionCalendar;
}

export function buildSnakes(calendar, login) {
  const grid = buildGrid(calendar);
  const plan = planRun(grid);
  return {
    files: {
      "github-contribution-grid-snake.svg": renderSnake(grid, plan, { themeName: "light", login }),
      "github-contribution-grid-snake-dark.svg": renderSnake(grid, plan, { themeName: "dark", login }),
    },
    plan,
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args: argv,
    options: { user: { type: "string" }, out: { type: "string", default: "dist" } },
    strict: true,
  });

  const login = assertLogin(values.user);
  const outDir = path.resolve(values.out);
  const root = path.resolve(".");
  if (outDir !== root && !outDir.startsWith(root + path.sep)) {
    throw new Error(`Output directory must be inside the working directory: ${outDir}`);
  }

  const token = env.GH_STATS_TOKEN || env.GITHUB_TOKEN;
  if (!env.GH_STATS_TOKEN) console.warn("GH_STATS_TOKEN not set; falling back to GITHUB_TOKEN (public data only).");

  const calendar = await fetchCalendar(createClient({ token }), login);
  const { files, plan } = buildSnakes(calendar, login);

  await mkdir(outDir, { recursive: true });
  for (const [name, svg] of Object.entries(files)) {
    await writeFile(path.join(outDir, name), svg, "utf8");
  }
  console.log(`Wrote ${Object.keys(files).length} snakes to ${outDir} (grows ${plan.startLength} → ${plan.finalLength} over ${plan.eaten.length} active days).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
