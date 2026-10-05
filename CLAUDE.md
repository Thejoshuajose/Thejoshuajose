# CLAUDE.md: Thejoshuajose (GitHub profile)

FIWB Solutions LLC · Author: Joshua Gonzales

The GitHub profile README repository for `Thejoshuajose`. `README.md` **is** the profile page. Every change to it is public and shows on github.com/Thejoshuajose.

## Commands

- `npm test`: node:test suites for the stats and snake generators (no dependencies, Node ≥ 22)
- `GH_STATS_TOKEN=$(gh auth token) npm run stats`: render the four stat cards into `dist/` (gitignored) for preview
- `GH_STATS_TOKEN=$(gh auth token) npm run snake`: render both contribution snakes into `dist/`

## Layout

- `README.md`: profile content. A top HTML comment holds the ownership and setup pointer, so it stays invisible on the profile.
- `assets/banner.svg`: hand-written SVG. System font stacks only, because GitHub serves SVGs as `<img>` and they can't load web fonts. Animations must sit behind `prefers-reduced-motion`. It is a terminal window on a 12 s loop (typed `whoami`, then a `deploy` that ticks off each layer). The resting state is the finished screen and animations only hide or reveal, so with motion off everything is visible. Typing uses `.cover` rects in the window colour that shrink with `steps(n)`, where n is the character count; keep cover widths matched to the text.
- `scripts/stats/`: `aggregate.mjs` (pure maths), `github.mjs` (GraphQL client), `render.mjs` (SVG), `generate.mjs` (CLI)
- `scripts/snake/`: `plan.mjs` (grid, route, growth timeline), `render.mjs` (animated SVG), `generate.mjs` (CLI). Reuses the stats GraphQL client and `escapeXml`.
- `.github/workflows/`: `snake.yml` → `output` branch, `stats.yml` → `stats` branch, `test.yml`
- `docs/SETUP.md`: setup steps, placeholder checklist, bios, profile configuration

## Conventions and constraints

- **No invented content.** Projects, metrics and claims must trace back to a real repo or live site. Describe client work at the product level and never expose internal infrastructure, collection names, endpoints or env details.
- **No repositories on the profile.** The owner chose not to showcase any repos: no Featured projects section, no repo names or links, no pins, and never modify the other repositories from here.
- **Contact details**: email is `admin@fiwbsolution.com` (domain without the "s"; it's the one with MX records). Don't swap in any other address from account metadata. The website is `https://fiwbsolutions.com` and LinkedIn is `https://www.linkedin.com/in/joshua-j-gonzales`. There is no Portfolio button.
- **Badges**: Shields `for-the-badge`, background `161B22`, white logos. Simple Icons has dropped C#, AWS, LinkedIn and every Microsoft brand (Azure, Windows), so C#, AWS, LinkedIn, Azure, WPF and Windows Forms use inline base64 monoline SVG logos. Verify any new badge renders a logo (`curl … | grep -c '<image'`).
- **Palette**: bg `#0D1117`, surface `#161B22`, text `#F0F6FC`, muted `#8B949E`, accent `#2563EB`. Use the accent sparingly.
- **Stats honesty**: private contributions come back only as `restrictedContributionsCount`, so per-type numbers like commits undercount. Cards use calendar totals, active days and streaks instead. Cards must keep their scope label. The owner asked to drop the "composition, not proficiency" footnote from the languages card; don't re-add it.
- **Workflows** pin third-party actions to commit SHAs with a `# vX.Y.Z` comment. Lint with `docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:latest` (needs `MSYS_NO_PATHCONV=1` in Git Bash).
- `METRICS_TOKEN` (repo secret) is a fine-grained read-only PAT. Without it the cards fall back to public data.
- **Snake**: our own generator, not Platane/snk (its snake can't grow). It moves like snk (faintest cells first, nearest first, roaming a one-cell ring around the grid) and grows one segment per active day eaten. Each move is simulated against the moving body and accepted only if the head can still reach its tail afterwards, so it can never trap itself. Under the grid, a progress bar (snk's "stack") gains a slice in each eaten cell's colour, in eating order. If a plan ever fails, `planRun` retries with growth capped (120 → … → no growth) instead of failing CI. The body is a few stroked copies of the route path (two narrowing tail pieces from `TAPER`, the body, a dorsal stripe that reuses the body keyframes), each animated through `stroke-dasharray`/`stroke-dashoffset`, so the keyframe count scales with meals, not segments × steps. Keep it that way, because per-segment keyframes would blow the SVG up to megabytes. The head (eyes, flicking tongue) is moved by CSS `transform` keyframes from `headKeyframes`: none on straight runs, and two per corner, `TURN_MS` apart, so it swings round instead of snapping. Never use SMIL (`<animate*>`) or anything else on a separate clock. Browsers pause and throttle SMIL and CSS independently (offscreen images, background tabs), which tore the head off the body; a test asserts there is no SMIL. Don't use CSS `offset-path` either, because it isn't reliable on SVG elements. Check visuals with a paused headless Edge screenshot of an HTML page that inlines the SVG and injects `*{animation-delay:-Ns!important;animation-play-state:paused!important}`.
- Never edit the `output` or `stats` branches by hand. CI force-pushes them.
