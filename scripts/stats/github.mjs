// Minimal GitHub GraphQL client for the stat cards: timeouts, bounded retries, loud errors.

const ENDPOINT = "https://api.github.com/graphql";
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export function assertLogin(login) {
  if (typeof login !== "string" || !LOGIN.test(login)) {
    throw new Error(`Invalid GitHub username: ${JSON.stringify(login)}`);
  }
  return login;
}

export function createClient({ token, fetchImpl = globalThis.fetch, timeoutMs = 20_000, retries = 2, sleep = defaultSleep }) {
  if (!token) throw new Error("A GitHub token is required (set GH_STATS_TOKEN or GITHUB_TOKEN).");

  return async function query(text, variables = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
      let response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "profile-stats-generator",
          },
          body: JSON.stringify({ query: text, variables }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastError = new Error(`GitHub API request failed: ${error.message}`, { cause: error });
        continue;
      }

      if (RETRYABLE_STATUS.has(response.status)) {
        lastError = new Error(`GitHub API returned ${response.status}`);
        continue;
      }
      if (!response.ok) {
        const body = (await response.text()).slice(0, 300);
        throw new Error(`GitHub API returned ${response.status}: ${body}`);
      }

      const payload = await response.json();
      if (payload.errors?.length) {
        throw new Error(`GitHub GraphQL error: ${payload.errors.map((e) => e.message).join("; ")}`);
      }
      if (!payload.data) throw new Error("GitHub GraphQL response contained no data");
      return payload.data;
    }
    throw lastError;
  };
}

const REPOS_QUERY = `
query($login: String!, $cursor: String) {
  user(login: $login) {
    contributionsCollection { contributionYears }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        isPrivate
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const YEAR_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

// Pagination is capped so a misbehaving cursor can never loop forever.
const MAX_REPO_PAGES = 20;

export async function fetchProfileData(query, login, now = new Date()) {
  assertLogin(login);

  const repos = [];
  let years = [];
  let totalCount = 0;
  let cursor = null;
  for (let page = 0; page < MAX_REPO_PAGES; page += 1) {
    const data = await query(REPOS_QUERY, { login, cursor });
    if (!data.user) throw new Error(`GitHub user not found: ${login}`);
    if (page === 0) years = data.user.contributionsCollection.contributionYears ?? [];
    const connection = data.user.repositories;
    totalCount = connection.totalCount;
    repos.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }

  const currentYear = now.getUTCFullYear();
  const yearList = years.length ? years : [currentYear];
  const collections = [];
  for (const year of yearList) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = year === currentYear ? now.toISOString() : `${year}-12-31T23:59:59Z`;
    const data = await query(YEAR_QUERY, { login, from, to });
    collections.push({ year, collection: data.user.contributionsCollection });
  }

  return { repos, repoCount: totalCount, years: collections, currentYear };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
