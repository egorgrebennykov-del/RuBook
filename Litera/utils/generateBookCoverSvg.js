/**
 * Generates a dynamic, elegant SVG book cover Data URI for books that do not have
 * an official photographic cover. Deterministically creates a styled book cover
 * based on the title, author, and publisher.
 */

const PALETTES = [
  { bg1: "#0b192c", bg2: "#1e3e62", accent: "#f1ba48", border: "#f1ba48" }, // Sapphire
  { bg1: "#052e16", bg2: "#14532d", accent: "#86efac", border: "#86efac" }, // Emerald
  { bg1: "#450a0a", bg2: "#7f1d1d", accent: "#fde047", border: "#fde047" }, // Burgundy
  { bg1: "#3b0764", bg2: "#581c87", accent: "#e9d5ff", border: "#e9d5ff" }, // Amethyst
  { bg1: "#3f0713", bg2: "#881337", accent: "#fecdd3", border: "#fecdd3" }, // Crimson
  { bg1: "#042f2e", bg2: "#115e59", accent: "#5eead4", border: "#5eead4" }, // Teal
  { bg1: "#451a03", bg2: "#78350f", accent: "#fcd34d", border: "#fcd34d" }, // Amber
  { bg1: "#18181b", bg2: "#27272a", accent: "#e4e4e7", border: "#a1a1aa" }, // Charcoal
  { bg1: "#1e1b4b", bg2: "#312e81", accent: "#c7d2fe", border: "#a5b4fc" }, // Indigo
  { bg1: "#3e1f17", bg2: "#70382b", accent: "#fed7aa", border: "#fdba74" }, // Russet
  { bg1: "#2e1065", bg2: "#4c1d95", accent: "#f5d0fe", border: "#f0abfc" }, // Plum
  { bg1: "#172554", bg2: "#1e40af", accent: "#bfdbfe", border: "#93c5fd" }, // Cobalt
];

function stringHash(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeXml(unsafe = "") {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text, maxChars = 18, maxLines = 4) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // If text exceeded maxLines, add ellipsis to last line
  if (lines.length === maxLines && words.length > lines.join(" ").split(" ").length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = (last.length > maxChars - 3 ? last.slice(0, maxChars - 3) : last) + "...";
  }

  return lines;
}

export function generateBookCoverSvg({
  title = "Книга",
  author = "",
  publisher = "",
  series = "",
  id = 0,
} = {}) {
  const hash = stringHash(`${title}-${author}-${publisher}-${id}`);
  const palette = PALETTES[hash % PALETTES.length];

  const cleanTitle = title.trim() || "Книга";
  const cleanAuthor = author ? author.trim() : "";
  const cleanPublisher = publisher ? publisher.trim().toUpperCase() : "LITERA";
  const cleanSeries = series ? series.trim() : "";

  const titleLines = wrapText(cleanTitle, 16, 4);

  // Calculate layout
  const startY = 220 - (titleLines.length * 24) / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 440" width="300" height="440">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg1}" />
      <stop offset="100%" stop-color="${palette.bg2}" />
    </linearGradient>
    <linearGradient id="spineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.45)" />
      <stop offset="60%" stop-color="rgba(0,0,0,0.15)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0.08)" />
    </linearGradient>
    <radialGradient id="glowGrad" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.12" />
      <stop offset="100%" stop-color="${palette.bg1}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Clean modern card -->
  <rect width="300" height="440" rx="8" fill="#1e293b" />
  <rect x="2" y="2" width="296" height="436" rx="6" fill="#0f172a" />

  <!-- Subtle book icon -->
  <g transform="translate(150, 160)" stroke="#64748b" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M-24,-14 C-12,-18 0,-14 0,-10 C0,-14 12,-18 24,-14 L24,24 C12,20 0,24 0,28 C0,24 -12,20 -24,24 Z" />
    <line x1="0" y1="-10" x2="0" y2="28" />
  </g>

  <!-- Title -->
  <g transform="translate(150, 240)">
    ${titleLines.map((line, idx) => `
      <text x="0" y="${idx * 22}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500" fill="#cbd5e1">
        ${escapeXml(line)}
      </text>
    `).join("")}
  </g>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default generateBookCoverSvg;
