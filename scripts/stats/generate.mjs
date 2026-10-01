#!/usr/bin/env node
// Generates the profile stat cards (dark + light) from the GitHub GraphQL API.
// Usage: node scripts/stats/generate.mjs --user <login> --out <dir>
// Token: GH_STATS_TOKEN (PAT that can see private repos) or GITHUB_TOKEN (public data only).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { aggregateLanguages, summarizeActivity } from "./aggregate.mjs";
import { assertLogin, createClient, fetchProfileData } from "./github.mjs";
import { renderActivityCard, renderLanguagesCard } from "./render.mjs";

export function buildCards(data) {
  const languages = aggregateLanguages(data.repos);
  const summary = summarizeActivity(data.years, data.currentYear);
  const scopeLabel = data.repos.some((r) => r.isPrivate) ? "public + private" : "public repositories";

  const files = {};
  for (const themeName of ["dark", "light"]) {
    const suffix = themeName === "dark" ? "-dark" : "";
    files[`activity${suffix}.svg`] = renderActivityCard(summary, { themeName, currentYear: data.currentYear, scopeLabel });
    files[`languages${suffix}.svg`] = renderLanguagesCard(languages, { themeName, repoCount: data.repoCount, scopeLabel });
  }
  return files;
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

  const data = await fetchProfileData(createClient({ token }), login);
  const files = buildCards(data);

  await mkdir(outDir, { recursive: true });
  for (const [name, svg] of Object.entries(files)) {
    await writeFile(path.join(outDir, name), svg, "utf8");
  }
  console.log(`Wrote ${Object.keys(files).length} cards to ${outDir} (${data.repoCount} repositories, ${data.years.length} contribution years).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
