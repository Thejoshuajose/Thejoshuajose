import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as fsp from "node:fs/promises";
import { fetchBadge, isWellFormedSvg, main, MANIFEST, publishAll, validateBadgeSvg, validateManifest } from "../scripts/badges/generate.mjs";

const GOOD = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:x"/><text>React</text></svg>';
const URL_A = "https://img.shields.io/badge/React-161B22?style=for-the-badge&logo=react";
const ok = (body) => async () => new Response(body, { status: 200 });

test("validateManifest accepts slug → Shields URL entries", () => {
  assert.deepEqual(validateManifest({ react: URL_A }), [["react", URL_A]]);
});

test("validateManifest rejects bad shapes, slugs and hosts", () => {
  assert.throws(() => validateManifest(null), /must be an object/);
  assert.throws(() => validateManifest([]), /must be an object/);
  assert.throws(() => validateManifest({}), /empty/);
  assert.throws(() => validateManifest({ "../evil": URL_A }), /Invalid badge slug/);
  assert.throws(() => validateManifest({ React: URL_A }), /Invalid badge slug/);
  assert.throws(() => validateManifest({ react: "https://evil.example/badge.svg" }), /Shields URL/);
  assert.throws(() => validateManifest({ react: 42 }), /Shields URL/);
});

test("validateBadgeSvg requires a logo-bearing, inert SVG", () => {
  assert.equal(validateBadgeSvg("react", GOOD), GOOD);
  assert.throws(() => validateBadgeSvg("react", ""), /empty/);
  assert.throws(() => validateBadgeSvg("react", "<html></html>"), /not a well-formed SVG/);
  assert.throws(() => validateBadgeSvg("react", "<svg><image></svg>"), /not a well-formed SVG/);
  assert.throws(() => validateBadgeSvg("react", "<svg><text>React</text></svg>"), /no logo/);
  assert.throws(() => validateBadgeSvg("react", "<svg><image/><script>alert(1)</script></svg>"), /active content/);
  assert.throws(() => validateBadgeSvg("react", '<svg onload="x()"><image/></svg>'), /active content/);
  assert.throws(() => validateBadgeSvg("react", `<svg><image/>${"x".repeat(70000)}</svg>`), /bytes/);
});

test("fetchBadge retries network and HTTP failures, then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) throw new Error("socket hang up");
    if (calls === 2) return new Response("", { status: 504 });
    return new Response(GOOD, { status: 200 });
  };
  assert.equal(await fetchBadge("react", URL_A, { fetchImpl }), GOOD);
  assert.equal(calls, 3);
});

test("fetchBadge gives up after the attempt budget with an actionable error", async () => {
  const fetchImpl = async () => new Response("", { status: 503 });
  await assert.rejects(fetchBadge("react", URL_A, { fetchImpl, attempts: 2 }), /"react" after 2 attempts: HTTP 503/);
});

test("fetchBadge does not retry a malformed body", async () => {
  let calls = 0;
  const fetchImpl = async () => (calls++, new Response("<svg></svg>", { status: 200 }));
  await assert.rejects(fetchBadge("react", URL_A, { fetchImpl }), /no logo/);
  assert.equal(calls, 1);
});

test("main writes every badge, and writes nothing if any badge fails", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".tmp-badges-"));
  try {
    const manifestPath = path.join(dir, "badges.json");
    await writeFile(manifestPath, JSON.stringify({ react: URL_A, docker: URL_A.replace("React", "Docker") }));
    const out = path.join(dir, "out");

    assert.deepEqual(await main(["--out", out], { fetchImpl: ok(GOOD), manifestPath }), ["react.svg", "docker.svg"]);
    assert.deepEqual((await readdir(out)).sort(), ["docker.svg", "react.svg"]);

    const failOut = path.join(dir, "fail");
    const fetchImpl = async (url) => new Response(url.includes("Docker") ? "<svg></svg>" : GOOD, { status: 200 });
    await assert.rejects(main(["--out", failOut], { fetchImpl, manifestPath }), /"docker" has no logo/);
    assert.equal(existsSync(failOut), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("main refuses to write outside the working directory", async () => {
  const outside = path.join(os.tmpdir(), "badges-outside");
  await assert.rejects(main(["--out", outside], { fetchImpl: ok(GOOD) }), /inside the working directory/);
});

// The profile must never hot-link Shields: camo times out on slow responses and shows broken images.
test("README serves every badge from the committed set", () => {
  const readme = readFileSync("README.md", "utf8");
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const slugs = Object.keys(manifest).sort();

  assert.equal(readme.includes("img.shields.io"), false, "README hot-links img.shields.io; run npm run badges and use assets/badges/");
  const referenced = [...readme.matchAll(/src="assets\/badges\/([^"]+)\.svg"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(referenced)].sort(), slugs);

  const files = readdirSync("assets/badges").filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(files, slugs);
  for (const slug of slugs) validateBadgeSvg(slug, readFileSync(`assets/badges/${slug}.svg`, "utf8"));
});

test("isWellFormedSvg accepts Shields-style markup", () => {
  assert.equal(isWellFormedSvg(GOOD), true);
  assert.equal(isWellFormedSvg(`<?xml version="1.0"?>\n<svg a="1" b='2'><!-- c --><g><image/></g><text>A &amp; B &#183;</text></svg>\n`), true);
});

test("isWellFormedSvg rejects malformed documents", () => {
  for (const bad of [
    "<svg><image></svg>",
    "<svg><g></svg></g>",
    "<svg></svg><svg></svg>",
    "junk<svg></svg>",
    "<svg></svg>junk",
    "<svg/>",
    "<html></html>",
    "<svg><g a=1></g></svg>",
    '<svg><g a="x"></g ></svg> >',
    "<svg>a & b</svg>",
    "<svg><g>",
    "<svg><</svg>",
    "",
  ]) assert.equal(isWellFormedSvg(bad), false, bad);
});

test("publishAll rolls back already-replaced files when a later rename fails", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".tmp-publish-"));
  try {
    const a = path.join(dir, "a.svg");
    const b = path.join(dir, "b.svg");
    const c = path.join(dir, "c.svg");
    await writeFile(a, "old-a");
    await writeFile(b, "old-b");
    const failing = { ...fsp, rename: async (from, to) => (to === c ? Promise.reject(new Error("EBUSY: locked")) : fsp.rename(from, to)) };

    await assert.rejects(publishAll([[a, "new-a"], [b, "new-b"], [c, "new-c"]], failing), /previous set restored: EBUSY: locked/);
    assert.equal(await readFile(a, "utf8"), "old-a");
    assert.equal(await readFile(b, "utf8"), "old-b");
    assert.deepEqual((await readdir(dir)).sort(), ["a.svg", "b.svg"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publishAll removes newly created files and staged temps when staging fails", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".tmp-publish-"));
  try {
    const a = path.join(dir, "a.svg");
    const b = path.join(dir, "b.svg");
    const failing = { ...fsp, writeFile: async (file, data) => (file === `${b}.tmp` ? Promise.reject(new Error("ENOSPC")) : fsp.writeFile(file, data)) };

    await assert.rejects(publishAll([[a, "new-a"], [b, "new-b"]], failing), /ENOSPC/);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publishAll writes every file on success", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".tmp-publish-"));
  try {
    const a = path.join(dir, "a.svg");
    await writeFile(a, "old-a");
    await publishAll([[a, "new-a"], [path.join(dir, "b.svg"), "new-b"]]);
    assert.equal(await readFile(a, "utf8"), "new-a");
    assert.deepEqual((await readdir(dir)).sort(), ["a.svg", "b.svg"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
