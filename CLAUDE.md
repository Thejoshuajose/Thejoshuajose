# CLAUDE.md: Thejoshuajose (GitHub profile)

FIWB Solutions LLC · Author: Joshua Gonzales

The GitHub profile README repository for `Thejoshuajose`. `README.md` **is** the profile page. Every change to it is public and shows on github.com/Thejoshuajose.

## Commands

- `npm test`: node:test suites for the stats generator (no dependencies, Node ≥ 22)
- `GH_STATS_TOKEN=$(gh auth token) npm run stats`: render the four stat cards into `dist/` (gitignored) for preview

## Layout

- `README.md`: profile content. A top HTML comment holds the ownership and setup pointer, so it stays invisible on the profile.
- `assets/banner.svg`: hand-written SVG. System font stacks only, because GitHub serves SVGs as `<img>` and they can't load web fonts. Animations must sit behind `prefers-reduced-motion`.
- `scripts/stats/`: `aggregate.mjs` (pure maths), `github.mjs` (GraphQL client), `render.mjs` (SVG), `generate.mjs` (CLI)
- `.github/workflows/`: `snake.yml` → `output` branch, `stats.yml` → `stats` branch, `test.yml`
- `docs/SETUP.md`: setup steps, placeholder checklist, bios, profile configuration

## Conventions and constraints

- **No invented content.** Projects, metrics and claims must trace back to a real repo or live site. Describe client work at the product level and never expose internal infrastructure, collection names, endpoints or env details.
- **No repositories on the profile.** The owner chose not to showcase any repos: no Featured projects section, no repo names or links, no pins, and never modify the other repositories from here.
- **Contact details**: email is `admin@fiwbsolution.com` (domain without the "s"; it's the one with MX records). Don't swap in any other address from account metadata. The website is `https://fiwbsolutions.com` and LinkedIn is `https://www.linkedin.com/in/joshua-j-gonzales`. There is no Portfolio button.
- **Badges**: Shields `for-the-badge`, background `161B22`, white logos. Simple Icons has dropped C#, AWS and LinkedIn, so those use inline base64 monoline SVG logos. Verify any new badge renders a logo (`curl … | grep -c '<image'`).
- **Palette**: bg `#0D1117`, surface `#161B22`, text `#F0F6FC`, muted `#8B949E`, accent `#2563EB`. Use the accent sparingly.
- **Stats honesty**: private contributions come back only as `restrictedContributionsCount`, so per-type numbers like commits undercount. Cards use calendar totals, active days and streaks instead. Cards must keep their scope label and the "composition, not proficiency" note.
- **Workflows** pin third-party actions to commit SHAs with a `# vX.Y.Z` comment. Lint with `docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:latest` (needs `MSYS_NO_PATHCONV=1` in Git Bash).
- `METRICS_TOKEN` (repo secret) is a fine-grained read-only PAT. Without it the cards fall back to public data.
- Never edit the `output` or `stats` branches by hand. CI force-pushes them.
