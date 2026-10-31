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

  // go.ast.ru are HTML redirect pages, not direct images
  if (resolved.includes("go.ast.ru/")) {
    return "";
  }

  // AST book redirect links or codes (ASE or AST prefix)
  const astCodeMatch = resolved.match(/(AS[ET]\d{6,18})/i);
  if (astCodeMatch) {
    return `https://cdn.ast.ru/v2/${astCodeMatch[1].toUpperCase()}/COVER/cover1__w340.jpg`;
  }

  // Yandex Disk public view links -> proxy via backend for real preview bytes
  if (resolved.includes("disk.yandex.") || resolved.includes("disk.360.yandex.")) {
    return `/api/enhance-image?url=${encodeURIComponent(resolved)}`;
  }

  return resolved;
}
