# Profile setup and maintenance

**FIWB Solutions LLC** · Author: **Joshua Gonzales**

This repository is the GitHub profile README for [`Thejoshuajose`](https://github.com/Thejoshuajose). GitHub shows its `README.md` on the profile page because the repository name matches the username.

## Repository structure

```text
Thejoshuajose/
├── README.md                     # the profile page itself
├── CLAUDE.md                     # instructions for Claude Code
├── AGENTS.md                     # the same guidance for any AI agent
├── package.json                  # npm test / npm run stats (no dependencies)
├── .gitignore
├── assets/
│   └── banner.svg                # hero banner (self-contained, animated, respects reduced motion)
├── docs/
│   └── SETUP.md                  # this file
├── scripts/
│   ├── snake/
│   │   ├── plan.mjs              # calendar → grid → snk-style hunt with collision-safe growth (pure)
│   │   ├── render.mjs            # animated SVG: one stroked path whose dash grows as it eats
│   │   └── generate.mjs          # CLI entry used by snake.yml
│   └── stats/
│       ├── aggregate.mjs         # language + streak + activity maths (pure)
│       ├── github.mjs            # GraphQL client: timeouts, retries, pagination
│       ├── render.mjs            # SVG card rendering, dark + light
│       └── generate.mjs          # CLI entry used by the workflow
├── test/                         # node:test suites for both generators
└── .github/
    └── workflows/
        ├── snake.yml             # growing contribution snake → `output` branch
        ├── stats.yml             # activity + language cards → `stats` branch
        └── test.yml              # runs npm test on push / PR
```

Branches written by CI (never edit by hand):

| Branch   | Written by   | Files |
|----------|--------------|-------|
| `output` | `snake.yml`  | `github-contribution-grid-snake.svg`, `github-contribution-grid-snake-dark.svg` |
| `stats`  | `stats.yml`  | `activity.svg`, `activity-dark.svg`, `languages.svg`, `languages-dark.svg` |

### Why the stat cards are self-generated

Almost every repository on this account is private client work. The public GitHub Readme Stats instance only sees public repositories, so its language card would describe a handful of coursework repos instead of the real stack, and its shared hosted instance is rate-limited. `stats.yml` builds the cards from the GraphQL API on a schedule instead. That way the README doesn't depend on a third-party server, and the numbers include private work. Each card shows its scope ("public + private" or "public repositories") and the language card says it measures composition, not proficiency.

## 1. Create the profile repository

```bash
gh repo create Thejoshuajose/Thejoshuajose --public \
  --description "GitHub profile" --source . --remote origin
```

Or create it on github.com: **New repository**, name `Thejoshuajose`, **Public**, no README/licence (this folder already has them).

## 2. Commit and push

```bash
cd C:/Users/joshu/source/repos/Thejoshuajose/Thejoshuajose
npm test                       # must pass
git status                     # confirm no dist/, .env, .remember/ or .claude/settings.local.json
git add .
git commit -m "feat: profile README, banner, stats and snake workflows"
git remote add origin https://github.com/Thejoshuajose/Thejoshuajose.git   # skip if gh created it
git push -u origin main
```

## 3. Enable Actions and permissions

1. **Settings → Actions → General → Actions permissions**: allow actions. The workflows pin `actions/*` and `crazy-max/ghaction-github-pages` to commit SHAs. If you restrict to selected actions, allow those two owners.
2. **Settings → Actions → General → Workflow permissions**: the workflows request `contents: write` themselves. If the org/account default is read-only and the run fails with `403` on push, set this to **Read and write permissions**.

## 4. Add the stats token (recommended)

Without it the cards fall back to public data only.

1. github.com → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Resource owner: `Thejoshuajose`. Repository access: **All repositories**.
3. Repository permissions: **Metadata: Read-only** (selected automatically). Nothing else.
4. Expiration: 1 year, with a calendar reminder to rotate it.
5. In this repository: **Settings → Secrets and variables → Actions → New repository secret**, name `METRICS_TOKEN`, paste the token.

The token is only exposed to the "Generate stat cards" step, is never written to disk or logs, and can't write anything.

For private contributions to appear on the snake and in the contribution counts, also turn on **Profile → Contributions & activity → Include private contributions on my profile**.

## 5. Generate the snake and the cards

**Actions** tab → **Contribution snake** → **Run workflow**, then **Profile stats** → **Run workflow**. Each takes under a minute. After that they run automatically: the snake every 12 hours, the stats daily at 05:17 UTC. Until the first run the three images show their alt text.

To preview the cards locally:

```bash
GH_STATS_TOKEN=$(gh auth token) npm run stats   # writes dist/*.svg (gitignored)
```

## 6. Contact details

No placeholders remain. The README uses:

- Website: `https://fiwbsolutions.com`
- LinkedIn: `https://www.linkedin.com/in/joshua-j-gonzales`
- Email: `admin@fiwbsolution.com` (note the domain is `fiwbsolution.com`, without the "s"; that domain is the one with mail servers)

If the account is ever renamed, replace `Thejoshuajose` throughout the README.

## 7. Configure the profile

- **Profile image**: a clear, well-lit headshot or a simple monogram on `#0D1117`. Use the same image everywhere.
- **Name**: Josh Gonzales (or Joshua Gonzales).
- **Bio**: pick one of the options below.
- **Company**: `FIWB Solutions` (already set).
- **Location**: optional.
- **Website**: `https://fiwbsolutions.com` (already set).
- **Social accounts**: LinkedIn `in/joshua-j-gonzales` (already set). Add others only if they're professional.
- **Pronouns, status, achievements**: optional. Leave the status blank or keep it professional.

### Bio options (GitHub limit: 160 characters)

1. `Full-stack developer building web apps, APIs, mobile apps and cloud infrastructure, from first idea to production. FIWB Solutions LLC.` (134)
2. `Full-stack engineer · React, TypeScript, C#/.NET, Python/FastAPI, PostgreSQL, AWS. I build software that runs real businesses.` (126)
3. `I build full-stack products: interface, API, database and deployment. Web, mobile and cloud at FIWB Solutions LLC.` (114)

## 8. Repositories

By decision, the profile doesn't showcase any repositories. There is no Featured projects section and nothing is pinned, and the existing repositories are left exactly as they are, private and unchanged. The profile tells the story through the intro, technologies, focus areas and activity cards instead.

The stat cards still count private work in aggregate (contribution totals, streaks, language share, number of owned repositories), but they never show repository names, descriptions or links.

## Maintenance

- **Currently building**: review monthly and remove anything finished or paused.
- **Action versions**: the workflows pin commit SHAs. To upgrade, resolve the new tag's SHA (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`), update the SHA and the version comment, then run `npm test` and a manual workflow run.
- **Stats generator**: run `npm test` after any change to `scripts/`. A pushed change to `scripts/**` triggers a fresh stats run.
