// SVG renderers for the profile stat cards. Every interpolated string goes through escapeXml.

export const THEMES = {
  dark: {
    background: "#0D1117",
    surface: "#161B22",
    border: "#21262D",
    text: "#F0F6FC",
    muted: "#8B949E",
    accent: "#2563EB",
    track: "#21262D",
  },
  light: {
    background: "#FFFFFF",
    surface: "#F6F8FA",
    border: "#D0D7DE",
    text: "#1F2328",
    muted: "#59636E",
    accent: "#2563EB",
    track: "#EAEEF2",
  },
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const WIDTH = 800;
const PAD = 32;

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]);
}

export function formatNumber(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString("en-US");
}

export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function theme(name) {
  const t = THEMES[name];
  if (!t) throw new Error(`Unknown theme: ${name}`);
  return t;
}

function frame(t, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title">
  <title id="title">${escapeXml(title)}</title>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="12" fill="${t.surface}" stroke="${t.border}"/>
${body}
</svg>
`;
}

function header(t, label, aside) {
  return `  <rect x="${PAD}" y="30" width="3" height="12" rx="1.5" fill="${t.accent}"/>
  <text x="${PAD + 12}" y="40" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${t.muted}">${escapeXml(label)}</text>
  <text x="${WIDTH - PAD}" y="40" text-anchor="end" font-family="${MONO}" font-size="11" fill="${t.muted}">${escapeXml(aside)}</text>`;
}

// Kept short enough to fit a fifth of the card: the year is shown once unless the range spans two.
export function rangeLabel(streak) {
  if (!streak?.length || !streak.start || !streak.end) return "No active streak";
  const short = (iso) => formatDate(iso).replace(/, \d{4}$/, "");
  const startYear = streak.start.slice(0, 4);
  const endYear = streak.end.slice(0, 4);
  if (streak.start === streak.end) return formatDate(streak.start);
  if (startYear === endYear) return `${short(streak.start)} – ${short(streak.end)}, ${endYear}`;
  return `${short(streak.start)} '${startYear.slice(2)} – ${short(streak.end)} '${endYear.slice(2)}`;
}

export function renderActivityCard(summary, { themeName = "dark", currentYear, scopeLabel }) {
  const t = theme(themeName);
  const { current, longest } = summary.streaks;
  const metrics = [
    { value: formatNumber(summary.totalContributions), label: "Total contributions", detail: "All time" },
    { value: formatNumber(summary.contributionsThisYear), label: "Contributions", detail: String(currentYear) },
    { value: formatNumber(summary.activeDaysThisYear), label: "Active days", detail: String(currentYear) },
    { value: `${formatNumber(current.length)}d`, label: "Current streak", detail: rangeLabel(current), accent: true },
    { value: `${formatNumber(longest.length)}d`, label: "Longest streak", detail: rangeLabel(longest) },
  ];

  const column = (WIDTH - PAD * 2) / metrics.length;
  const cells = metrics
    .map((m, i) => {
      const x = PAD + column * i;
      const divider = i === 0 ? "" : `\n  <line x1="${x}" y1="78" x2="${x}" y2="150" stroke="${t.border}"/>`;
      const inset = i === 0 ? 0 : 16;
      return `${divider}
  <text x="${x + inset}" y="112" font-family="${SANS}" font-size="30" font-weight="600" fill="${m.accent ? t.accent : t.text}">${escapeXml(m.value)}</text>
  <text x="${x + inset}" y="134" font-family="${SANS}" font-size="13" fill="${t.text}">${escapeXml(m.label)}</text>
  <text x="${x + inset}" y="152" font-family="${MONO}" font-size="10" fill="${t.muted}">${escapeXml(m.detail)}</text>`;
    })
    .join("");

  return frame(
    t,
    190,
    `Development activity: ${formatNumber(summary.totalContributions)} total contributions, current streak ${current.length} days, longest streak ${longest.length} days`,
    `${header(t, "DEVELOPMENT ACTIVITY", scopeLabel)}${cells}`,
  );
}

export function renderLanguagesCard(languages, { themeName = "dark", repoCount, scopeLabel }) {
  const t = theme(themeName);
  const barY = 64;
  const barWidth = WIDTH - PAD * 2;

  let segments = "";
  if (languages.length === 0) {
    segments = `  <rect x="${PAD}" y="${barY}" width="${barWidth}" height="8" rx="4" fill="${t.track}"/>`;
  } else {
    let x = PAD;
    segments = `  <clipPath id="bar"><rect x="${PAD}" y="${barY}" width="${barWidth}" height="8" rx="4"/></clipPath>\n  <g clip-path="url(#bar)">`;
    for (const lang of languages) {
      const w = (lang.percent / 100) * barWidth;
      segments += `\n    <rect x="${x.toFixed(2)}" y="${barY}" width="${Math.max(w, 0).toFixed(2)}" height="8" fill="${lang.color}"/>`;
      x += w;
    }
    segments += "\n  </g>";
  }

  const rows = Math.ceil(Math.max(languages.length, 1) / 2);
  const columnWidth = barWidth / 2;
  const legend = languages
    .map((lang, i) => {
      const x = PAD + (i % 2) * columnWidth;
      const y = 108 + Math.floor(i / 2) * 28;
      return `
  <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${lang.color}"/>
  <text x="${x + 18}" y="${y}" font-family="${SANS}" font-size="14" fill="${t.text}">${escapeXml(lang.name)}</text>
  <text x="${x + columnWidth - 24}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${t.muted}">${lang.percent.toFixed(1)}%</text>`;
    })
    .join("");

  const empty = languages.length === 0
    ? `\n  <text x="${PAD}" y="108" font-family="${SANS}" font-size="14" fill="${t.muted}">No language data available yet.</text>`
    : "";

  const footY = 108 + rows * 28 + 6;
  const footnote = `\n  <text x="${PAD}" y="${footY}" font-family="${MONO}" font-size="10" fill="${t.muted}">Share of code by bytes across ${formatNumber(repoCount)} owned repositories · markup excluded</text>`;

  const summary = languages.map((l) => `${l.name} ${l.percent.toFixed(1)}%`).join(", ") || "no data";
  return frame(
    t,
    footY + 26,
    `Repository language composition: ${summary}`,
    `${header(t, "LANGUAGE COMPOSITION", scopeLabel)}\n${segments}${legend}${empty}${footnote}`,
  );
}
