import { DEFAULT_RATE } from "./getExchangeRate.js";

let cachedStatus = null;
let cacheExpiry = 0;

export async function getCatalogStatus() {
  if (cachedStatus && Date.now() < cacheExpiry) {
    return cachedStatus;
  }

  try {
    const res = await fetch("/catalog-status.json");
    if (res.ok) {
      const data = await res.json();
      cachedStatus = data;
      cacheExpiry = Date.now() + 5 * 60 * 1000;
      return data;
    }
  } catch {
    // try api
  }

  try {
    const res = await fetch("/api/catalog-status");
    if (res.ok) {
      const data = await res.json();
      cachedStatus = data;
      cacheExpiry = Date.now() + 5 * 60 * 1000;
      return data;
    }
  } catch {
    // fallback
  }

  return {
    latest_catalog_update: "2026-10-30 16:44:35",
    eur_rub_rate: DEFAULT_RATE,
    total_catalogs: 210,
    total_books_synced: 1810,
  };
}

export async function triggerCatalogSync() {
  const res = await fetch("/api/sync-transbaltik", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Sync failed");
  }
  const result = await res.json();
  cachedStatus = result;
  return result;
}
