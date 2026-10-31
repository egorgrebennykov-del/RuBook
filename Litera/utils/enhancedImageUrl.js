export default function enhancedImageUrl(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== "string") return "";

  // Data URIs (dynamic SVG covers)
  if (sourceUrl.startsWith("data:image/")) {
    return sourceUrl;
  }

  // Local assets or already enhanced
  if (sourceUrl.startsWith("/assets/") || sourceUrl.startsWith("/api/enhance-image")) {
    return sourceUrl;
  }

  let resolved = sourceUrl.trim();

  // AST book redirect links or codes
  const astCodeMatch = resolved.match(/(ASE\d{12,18})/i);
  if (astCodeMatch) {
    return `https://cdn.ast.ru/v2/${astCodeMatch[1].toUpperCase()}/COVER/cover1__w340.jpg`;
  }

  // Yandex Disk public view links -> proxy via backend for real preview bytes
  if (resolved.includes("disk.yandex.ru/i/")) {
    return `/api/enhance-image?url=${encodeURIComponent(resolved)}`;
  }

  return resolved;
}
