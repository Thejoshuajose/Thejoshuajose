# AGENTS.md: Thejoshuajose profile repository

Owner: FIWB Solutions LLC · Author: Joshua Gonzales

## Purpose

This repository is rendered by GitHub as the profile page for the `Thejoshuajose` account. `README.md` is public-facing content, not developer documentation. Developer documentation lives in `docs/SETUP.md`.

## Stack

- Markdown with a small amount of GitHub-safe HTML (`<p align>`, `<picture>`, `<img>`, `<sub>`)
- A hand-authored SVG banner (`assets/banner.svg`): an animated terminal session that respects reduced motion
- Dependency-free Node.js (≥ 22, ES modules) generators for the stat cards (`scripts/stats/`) and the growing contribution snake (`scripts/snake/`)
- GitHub Actions: `crazy-max/ghaction-github-pages` to publish generated SVGs to the `output` and `stats` branches

## Commands

| Task | Command |
|------|---------|
| Run tests | `npm test` |
| Preview stat cards locally | `GH_STATS_TOKEN=<token> npm run stats` (writes to `dist/`, gitignored) |
| Preview the snake locally | `GH_STATS_TOKEN=<token> npm run snake` (writes to `dist/`) |
| Lint workflows | `actionlint` (or the `rhysd/actionlint` Docker image) |

## Rules for changes

1. Only state facts that can be traced to a real repository or live site. No invented projects, employers, metrics or testimonials.
2. Keep client work at product level. Don't publish internal hostnames, database or collection names, environment variables, or private repository structure.
3. Don't showcase repositories. No project section, repo names, repo links or pins, and don't modify other repositories. Contact email is `admin@fiwbsolution.com`.
4. Every image needs descriptive alt text, and the README must still read correctly when every image fails to load.
5. Keep layouts single-column or naturally wrapping. No fixed pixel widths wider than a phone screen, and no side-by-side cards.
6. Badges use Shields `for-the-badge` on `161B22` with white logos. Keep the set to about 19 technologies, grouped by category (Frontend, Backend, Mobile, Desktop, Data, Cloud and DevOps).
7. Changes under `scripts/` need tests in `test/` covering the happy path, edge cases and failure modes. `npm test` must pass.
8. Third-party GitHub Actions stay pinned to full commit SHAs. Workflows declare minimal `permissions`.
9. Never commit tokens, `.env` files or generated `dist/` output. The stats token is supplied only through the `METRICS_TOKEN` Actions secret.

## Generated branches

- `output`: `github-contribution-grid-snake.svg`, `github-contribution-grid-snake-dark.svg` (every 12 h). The snake hunts cells snk-style (faintest first) and grows one segment per active day it eats. Every move is checked so it can't collide with itself or get boxed in. A progress bar under the grid fills with each eaten cell's colour. The snake has a head with eyes and a flicking tongue (CSS transform keyframes that swing it round each corner, on the same clock as the body; never SMIL), a tapered tail and a dorsal stripe; the body pieces stay CSS dash animations so the file size scales with meals.
- `stats`: `activity.svg`, `activity-dark.svg`, `languages.svg`, `languages-dark.svg` (daily)

Both are force-pushed by CI. Don't commit to them manually.
