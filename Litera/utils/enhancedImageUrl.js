export default function enhancedImageUrl(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== "string") return "";
  if (sourceUrl.startsWith("/assets/") || sourceUrl.startsWith("/api/enhance-image")) {
    return sourceUrl;
  }

  let resolved = sourceUrl.trim();

  // Yandex Disk public view links -> direct download/preview if applicable
  if (resolved.includes("disk.yandex.ru/i/")) {
    return resolved;
  }

  return resolved;
}
