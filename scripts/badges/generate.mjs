#!/usr/bin/env node
// Downloads the Shields badges listed in badges.json into assets/badges/ so the profile serves them
// from the repo. Hot-linked Shields badges go through GitHub's camo proxy, which times out after ~4 s
// and leaves broken images whenever Shields is slow on a cold cache.
// Usage: node scripts/badges/generate.mjs [--out assets/badges]

import * as fsp from "node:fs/promises";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MANIFEST = fileURLToPath(new URL("./badges.json", import.meta.url));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHIELDS_PREFIX = "https://img.shields.io/badge/";
const MAX_BYTES = 64 * 1024;

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Badge manifest must be an object of slug → Shields URL");
  }
  const entries = Object.entries(manifest);
  if (entries.length === 0) throw new Error("Badge manifest is empty");
  for (const [slug, url] of entries) {
    if (!SLUG.test(slug)) throw new Error(`Invalid badge slug: ${JSON.stringify(slug)}`);
    if (typeof url !== "string" || !url.startsWith(SHIELDS_PREFIX)) {
      throw new Error(`Badge "${slug}" must be a Shields URL starting with ${SHIELDS_PREFIX}`);
    }
  }
  return entries;
}

// Every badge must be a well-formed SVG that actually carries its logo; Shields silently drops
// logos it doesn't recognise, which is how C#, AWS and the Microsoft brands broke before.
export function validateBadgeSvg(slug, svg) {
  if (typeof svg !== "string" || svg.length === 0) throw new Error(`Badge "${slug}" is empty`);
  if (svg.length > MAX_BYTES) throw new Error(`Badge "${slug}" is ${svg.length} bytes, over ${MAX_BYTES}`);
  if (!isWellFormedSvg(svg)) throw new Error(`Badge "${slug}" is not a well-formed SVG document`);
  if (/<script|<foreignObject|\son[a-z]+\s*=/i.test(svg)) throw new Error(`Badge "${slug}" contains active content`);
  if (!svg.includes("<image")) throw new Error(`Badge "${slug}" has no logo`);
  return svg;
}

const TAG = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const BAD_ENTITY = /&(?!(?:[A-Za-z][\w.-]*|#\d+|#x[\dA-Fa-f]+);)/;

// Strict enough for Shields output: one <svg> root, balanced tags, quoted attributes, valid entities.
// Comments, CDATA and an XML declaration are skipped; anything else unexpected fails closed.
export function isWellFormedSvg(svg) {
  const doc = svg
    .replace(/^﻿?\s*(?:<\?xml[^?]*\?>\s*)?/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (BAD_ENTITY.test(doc)) return false;
  const stack = [];
  let seenRoot = false;
  let i = 0;
  while (i < doc.length) {
    const lt = doc.indexOf("<", i);
    const text = doc.slice(i, lt === -1 ? doc.length : lt);
    if ((stack.length === 0 && text.trim() !== "") || text.includes(">")) return false;
    if (lt === -1) break;
    TAG.lastIndex = lt;
    const m = TAG.exec(doc);
    if (!m) return false;
    const [, closing, name, , selfClosing] = m;
    if (closing) {
      if (selfClosing || stack.pop() !== name) return false;
    } else {
      if (stack.length === 0) {
        if (seenRoot || name !== "svg" || selfClosing) return false;
        seenRoot = true;
      }
      if (!selfClosing) stack.push(name);
    }
    i = TAG.lastIndex;
  }
  return seenRoot && stack.length === 0;
}

// Stages every file, then swaps them in; if any step fails, restores the previous contents so the
// committed set is never left half-updated.
export async function publishAll(files, fs = fsp) {
  const staged = [];
  const replaced = [];
  try {
    for (const [file, content] of files) {
      await fs.writeFile(`${file}.tmp`, content);
      staged.push(file);
    }
    for (const [file] of files) {
      let previous = null;
      try {
        previous = await fs.readFile(file);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
      await fs.rename(`${file}.tmp`, file);
      replaced.push([file, previous]);
    }
  } catch (err) {
    const rollbackErrors = [];
    for (const [file, previous] of replaced.reverse()) {
      try {
        if (previous === null) await fs.rm(file, { force: true });
        else await fs.writeFile(file, previous);
      } catch (e) {
        rollbackErrors.push(`${file}: ${e.message}`);
      }
    }
    for (const file of staged) await fs.rm(`${file}.tmp`, { force: true }).catch((e) => rollbackErrors.push(`${file}.tmp: ${e.message}`));
    const suffix = rollbackErrors.length ? `; rollback also failed for ${rollbackErrors.join(", ")}` : "";
    throw new Error(`Writing badges failed, previous set restored: ${err.message}${suffix}`);
  }
}

export async function fetchBadge(slug, url, { fetchImpl = fetch, attempts = 3, timeoutMs = 15000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return validateBadgeSvg(slug, await res.text());
    } catch (err) {
      lastError = err;
      // A bad body won't fix itself on retry; only network and HTTP failures are worth repeating.
      if (/^Badge "/.test(err.message)) throw err;
    }
  }
  throw new Error(`Failed to fetch badge "${slug}" after ${attempts} attempts: ${lastError.message}`);
}

export async function main(argv = process.argv.slice(2), { fetchImpl = fetch, manifestPath = MANIFEST, fs = fsp } = {}) {
  const { values } = parseArgs({
    args: argv,
    options: { out: { type: "string", default: "assets/badges" } },
    strict: true,
  });

  const outDir = path.resolve(values.out);
  const root = path.resolve(".");
  if (outDir !== root && !outDir.startsWith(root + path.sep)) {
    throw new Error(`Output directory must be inside the working directory: ${outDir}`);
  }

  const entries = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  // Fetch everything before writing anything, so one bad badge leaves the committed set untouched.
  const svgs = await Promise.all(entries.map(([slug, url]) => fetchBadge(slug, url, { fetchImpl })));

  await mkdir(outDir, { recursive: true });
  await publishAll(entries.map(([slug], i) => [path.join(outDir, `${slug}.svg`), svgs[i]]), fs);
  return entries.map(([slug]) => `${slug}.svg`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (files) => console.log(`Wrote ${files.length} badges`),
    (err) => {
      console.error(err.message);
      process.exitCode = 1;
    },
  );
}
