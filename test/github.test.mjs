import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLogin, createClient, fetchProfileData } from "../scripts/stats/github.mjs";

const json = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const noSleep = async () => {};

test("assertLogin accepts valid usernames and rejects injection attempts", () => {
  assert.equal(assertLogin("Thejoshuajose"), "Thejoshuajose");
  assert.equal(assertLogin("a-b"), "a-b");
  for (const bad of ["", "-lead", "trail-", "double--dash", "a".repeat(40), "x y", "../etc", undefined]) {
    assert.throws(() => assertLogin(bad), /Invalid GitHub username/, String(bad));
  }
});

test("createClient requires a token", () => {
  assert.throws(() => createClient({ token: "" }), /token is required/);
});

test("client sends the token and returns data", async () => {
  let seen;
  const query = createClient({
    token: "t0k",
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return json(200, { data: { ok: true } });
    },
  });
  assert.deepEqual(await query("{ viewer { login } }", { a: 1 }), { ok: true });
  assert.equal(seen.url, "https://api.github.com/graphql");
  assert.equal(seen.init.headers.Authorization, "bearer t0k");
  assert.deepEqual(JSON.parse(seen.init.body).variables, { a: 1 });
});

test("client retries transient failures then succeeds", async () => {
  const responses = [new Error("socket hang up"), json(502, {}), json(200, { data: { n: 1 } })];
  let calls = 0;
  const query = createClient({
    token: "t",
    sleep: noSleep,
    fetchImpl: async () => {
      const next = responses[calls++];
      if (next instanceof Error) throw next;
      return next;
    },
  });
  assert.deepEqual(await query("q"), { n: 1 });
  assert.equal(calls, 3);
});

test("client gives up after the retry budget", async () => {
  let calls = 0;
  const query = createClient({ token: "t", retries: 1, sleep: noSleep, fetchImpl: async () => (calls++, json(503, {})) });
  await assert.rejects(query("q"), /returned 503/);
  assert.equal(calls, 2);
});

test("client does not retry auth errors and surfaces GraphQL errors", async () => {
  let calls = 0;
  const unauthorized = createClient({ token: "t", sleep: noSleep, fetchImpl: async () => (calls++, json(401, { message: "Bad credentials" })) });
  await assert.rejects(unauthorized("q"), /401: .*Bad credentials/);
  assert.equal(calls, 1);

  const gqlError = createClient({ token: "t", fetchImpl: async () => json(200, { errors: [{ message: "boom" }] }) });
  await assert.rejects(gqlError("q"), /GraphQL error: boom/);

  const noData = createClient({ token: "t", fetchImpl: async () => json(200, {}) });
  await assert.rejects(noData("q"), /no data/);
});

test("fetchProfileData paginates repositories and queries each contribution year", async () => {
  const calls = [];
  const query = async (text, vars) => {
    calls.push(vars);
    if (text.includes("repositories")) {
      const first = vars.cursor === null;
      return {
        user: {
          contributionsCollection: { contributionYears: [2026, 2025] },
          repositories: {
            totalCount: 2,
            pageInfo: { hasNextPage: first, endCursor: first ? "c1" : null },
            nodes: [{ isPrivate: !first, languages: { edges: [] } }],
          },
        },
      };
    }
    return { user: { contributionsCollection: { year: vars.from.slice(0, 4) } } };
  };

  const data = await fetchProfileData(query, "someone", new Date("2026-10-01T12:00:00Z"));
  assert.equal(data.repos.length, 2);
  assert.equal(data.repoCount, 2);
  assert.deepEqual(data.years.map((y) => y.year), [2026, 2025]);
  const yearCalls = calls.filter((c) => c.from);
  assert.equal(yearCalls[0].to, "2026-10-01T12:00:00.000Z");
  assert.equal(yearCalls[1].to, "2025-12-31T23:59:59Z");
});

test("fetchProfileData fails for unknown users and invalid logins", async () => {
  await assert.rejects(fetchProfileData(async () => ({ user: null }), "ghost"), /user not found/);
  await assert.rejects(fetchProfileData(async () => ({}), "bad name"), /Invalid GitHub username/);
});
