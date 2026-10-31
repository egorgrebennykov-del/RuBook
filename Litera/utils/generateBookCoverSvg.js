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

  <!-- Cover Background -->
  <rect width="300" height="440" rx="8" fill="url(#bgGrad)" />
  <rect width="300" height="440" rx="8" fill="url(#glowGrad)" />

  <!-- Book Spine 3D Effect -->
  <rect x="0" y="0" width="16" height="440" rx="4" fill="url(#spineGrad)" />
  <line x1="16" y1="0" x2="16" y2="440" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
  <line x1="20" y1="0" x2="20" y2="440" stroke="rgba(0,0,0,0.25)" stroke-width="1" />

  <!-- Elegant Foil Frames -->
  <rect x="26" y="20" width="250" height="400" rx="4" fill="none" stroke="${palette.border}" stroke-opacity="0.35" stroke-width="1.2" />
  <rect x="30" y="24" width="242" height="392" rx="2" fill="none" stroke="${palette.border}" stroke-opacity="0.18" stroke-width="0.8" />

  <!-- Corner Flourishes -->
  <circle cx="34" cy="28" r="2" fill="${palette.accent}" opacity="0.6" />
  <circle cx="268" cy="28" r="2" fill="${palette.accent}" opacity="0.6" />
  <circle cx="34" cy="412" r="2" fill="${palette.accent}" opacity="0.6" />
  <circle cx="268" cy="412" r="2" fill="${palette.accent}" opacity="0.6" />

  <!-- Top Publisher Header -->
  <text x="156" y="52" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="700" letter-spacing="2" fill="${palette.accent}" opacity="0.9">
    ${escapeXml(cleanPublisher.slice(0, 24))}
  </text>

  <!-- Top Line Divider -->
  <line x1="110" y1="62" x2="202" y2="62" stroke="${palette.border}" stroke-opacity="0.3" stroke-width="0.75" />

  <!-- Author Name -->
  ${cleanAuthor ? `<text x="156" y="96" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="13" font-style="italic" font-weight="500" fill="#f1f5f9" opacity="0.92">
    ${escapeXml(cleanAuthor.slice(0, 32))}
  </text>` : ""}

  <!-- Central Ornamental Emblem -->
  <g transform="translate(156, 140)">
    <circle cx="0" cy="0" r="22" fill="none" stroke="${palette.border}" stroke-opacity="0.3" stroke-width="1" />
    <circle cx="0" cy="0" r="18" fill="none" stroke="${palette.border}" stroke-opacity="0.15" stroke-dasharray="2,2" />
    <!-- Book Emblem Icon -->
    <path d="M-9,-6 C-5,-8 -1,-6 0,-4 C1,-6 5,-8 9,-6 L9,7 C5,5 1,7 0,9 C-1,7 -5,5 -9,7 Z" fill="none" stroke="${palette.accent}" stroke-width="1.4" stroke-linejoin="round" />
    <line x1="0" y1="-4" x2="0" y2="9" stroke="${palette.accent}" stroke-width="1" />
  </g>

  <!-- Book Title -->
  <g transform="translate(156, ${Math.max(startY, 185)})">
    ${titleLines.map((line, idx) => `
      <text x="0" y="${idx * 25}" text-anchor="middle" font-family="'Merriweather', Georgia, 'Times New Roman', serif" font-size="16" font-weight="700" fill="#ffffff" letter-spacing="0.3">
        ${escapeXml(line)}
      </text>
    `).join("")}
  </g>

  <!-- Bottom Divider -->
  <line x1="120" y1="365" x2="192" y2="365" stroke="${palette.border}" stroke-opacity="0.3" stroke-width="0.75" />
  <polygon points="156,363 158,365 156,367 154,365" fill="${palette.accent}" opacity="0.8" />

  <!-- Bottom Series / Edition -->
  ${cleanSeries ? `
  <text x="156" y="388" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="500" fill="#cbd5e1" opacity="0.75">
    ${escapeXml(cleanSeries.slice(0, 30))}
  </text>` : `
  <text x="156" y="388" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="600" letter-spacing="1.5" fill="${palette.accent}" opacity="0.75">
    КАТАЛОГ 2026
  </text>`}
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default generateBookCoverSvg;
