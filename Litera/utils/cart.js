import { getCookieUser, logout } from "./auth.js";
import getExchangeRate, { DEFAULT_RATE } from "./getExchangeRate.js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://qgxiisgzwcsevzyaoxvl.supabase.co";
const TABLE_URL = `${SUPABASE_URL}/rest/v1/cart`;
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function getRate() {
  try {
    const rate = await getExchangeRate();
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {
    // fallback below
  }
  return DEFAULT_RATE;
}

function requireUserId(userId) {
  const id = userId ?? getCookieUser()?.id;
  if (!id) throw new Error("Sign in to use your cart");
  return id;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMsg = `${body?.message || ""} ${body?.details || ""} ${body?.hint || ""}`;
    if (errorMsg.includes("cart_user_id_fkey") || response.status === 409) {
      logout();
      throw new Error("Your session has expired. Please sign in again.");
    }
    throw new Error(body?.message ?? body?.hint ?? "Could not access the cart");
  }
  return body;
}

export async function getCart(userId = getCookieUser()?.id) {
  const id = requireUserId(userId);
  const params = new URLSearchParams({
    select: "id,link,price,user_id,image,title,shop,quantity",
    user_id: `eq.${id}`,
    order: "id.desc",
  });
  const rows = (await request(`${TABLE_URL}?${params}`)) ?? [];
  return rows;
}

export async function getCartItem(url, userId = getCookieUser()?.id) {
  const id = requireUserId(userId);
  const params = new URLSearchParams({
    select: "id",
    user_id: `eq.${id}`,
    link: `eq.${url}`,
    limit: "1",
  });
  const rows = await request(`${TABLE_URL}?${params}`);
  return rows?.[0] ?? null;
}

export async function hasCartItem(url, userId = getCookieUser()?.id) {
  return Boolean(await getCartItem(url, userId));
}

export async function addToCart(book, userId = getCookieUser()?.id) {
  const id = requireUserId(userId);
  let rawPrice = Number(book.price);
  if (!Number.isFinite(rawPrice)) rawPrice = 0;

  let finalPrice = rawPrice;
  // If price is given in RUB, convert to EUR
  if (book.currency === "RUB" || (book.currency !== "EUR" && finalPrice > 100)) {
    const rate = await getRate();
    finalPrice = Math.round((finalPrice / rate) * 100) / 100;
  } else {
    finalPrice = Math.round(finalPrice * 100) / 100;
  }

  const bookUrl = book.url || (book.id ? `/book/${book.id}` : "");

  const params = new URLSearchParams({
    select: "id,link,price,user_id,image,title,shop,quantity",
    user_id: `eq.${id}`,
    link: `eq.${bookUrl}`,
    limit: "1",
  });
  const existing = await request(`${TABLE_URL}?${params}`);
  if (existing?.length) return existing[0];

  const inserted = await request(TABLE_URL, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      link: bookUrl,
      price: finalPrice > 0 ? finalPrice : 5.99,
      user_id: id,
      image: book.image || null,
      title: book.title || book.name,
      shop: book.publisher || book.store || book.shop || "Transbaltik",
      quantity: Math.max(1, Math.floor(Number(book.quantity) || 1)),
    }),
  });
  return inserted?.[0] ?? null;
}

export async function updateCartQuantity(
  cartItemId,
  quantity,
  userId = getCookieUser()?.id,
) {
  const id = requireUserId(userId);
  const nextQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const params = new URLSearchParams({
    id: `eq.${cartItemId}`,
    user_id: `eq.${id}`,
  });
  await request(`${TABLE_URL}?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity: nextQuantity }),
  });
  return nextQuantity;
}

export async function removeFromCart(cartItemId, userId = getCookieUser()?.id) {
  const id = requireUserId(userId);
  const params = new URLSearchParams({
    id: `eq.${cartItemId}`,
    user_id: `eq.${id}`,
  });
  await request(`${TABLE_URL}?${params}`, { method: "DELETE" });
}

export async function clearCart(userId = getCookieUser()?.id) {
  const id = requireUserId(userId);
  const params = new URLSearchParams({
    user_id: `eq.${id}`,
  });
  await request(`${TABLE_URL}?${params}`, { method: "DELETE" });
}
