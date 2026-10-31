import workerEnv from "./workerEnv.js";
import {
  processLiteraChat,
  filterInquiryMessageWithAI,
  translateLiteraDialog,
} from "./literaAssistantService.js";
import { sendGuestInquiryEmail } from "./emailService.js";
import { executeCatalogActionById } from "./catalogActionsService.js";

const ACTIONS = {
  "update-book-picks": {
    id: "update-book-picks",
    name: "Update Book Picks",
    workflowFile: "update-book-picks.yml",
  },
  "update-home-books": {
    id: "update-home-books",
    name: "Update Homepage Books",
    workflowFile: "update-home-books.yml",
  },
  "update-new-books": {
    id: "update-new-books",
    name: "Update New Books",
    workflowFile: "update-new-books.yml",
  },
  "update-exchange-rate": {
    id: "update-exchange-rate",
    name: "Update Exchange Rate",
    workflowFile: "update-exchange-rate.yml",
  },
  "update-discounts": {
    id: "update-discounts",
    name: "Update Discount Books",
    workflowFile: "update-discounts.yml",
  },
};

const actionStatuses = {};
for (const key of Object.keys(ACTIONS)) {
  actionStatuses[key] = {
    status: "idle",
    lastRun: null,
    output: "",
    error: null,
  };
}

const AUTO_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastAutoRunAt = 0;
let autoRunInFlight = false;

async function triggerSingleAction(actionId) {
  const action = ACTIONS[actionId];
  if (!action) {
    throw new Error(`Unknown action: ${actionId}`);
  }
  const startedAt = new Date().toISOString();
  actionStatuses[actionId] = {
    status: "running",
    startedAt,
    lastRun: startedAt,
    output: `[${new Date().toLocaleTimeString()}] Running ${action.name}...\n`,
    error: null,
  };

  try {
    const githubToken =
      globalThis.process?.env?.GITHUB_TOKEN ||
      globalThis.process?.env?.GH_TOKEN;
    if (githubToken) {
      fetch(
        `https://api.github.com/repos/egorgrebennykov-del/Litera/actions/workflows/${action.workflowFile}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Litera-App",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: "main" }),
        },
      ).catch(() => {});
    }

    const summary = await executeCatalogActionById(actionId);
    const finishedAt = new Date().toISOString();
    actionStatuses[actionId] = {
      status: "success",
      startedAt,
      finishedAt,
      lastRun: finishedAt,
      method: "auto-worker",
      output: `[${new Date().toLocaleTimeString()}] ${summary}\n`,
      error: null,
    };
    return actionStatuses[actionId];
  } catch (err) {
    const finishedAt = new Date().toISOString();
    actionStatuses[actionId] = {
      status: "error",
      startedAt,
      finishedAt,
      lastRun: finishedAt,
      output: `[${new Date().toLocaleTimeString()}] Error: ${err.message}\n`,
      error: err.message,
    };
    throw err;
  }
}

async function runScheduledCatalogActions() {
  if (autoRunInFlight) return;
  autoRunInFlight = true;
  lastAutoRunAt = Date.now();
  try {
    const now = new Date();
    const isMonday = now.getUTCDay() === 1;
    const isFirstOfMonth = now.getUTCDate() === 1;

    // Daily at 03:00: Exchange Rate & Discounts
    const order = ["update-exchange-rate", "update-discounts"];
    // Weekly on Monday at 03:00: New Books & Book Picks
    if (isMonday) {
      order.push("update-new-books", "update-book-picks");
    }
    // Monthly on the 1st at 03:00: Homepage Books
    if (isFirstOfMonth) {
      order.push("update-home-books");
    }

    for (const id of order) {
      try {
        await triggerSingleAction(id);
      } catch (err) {
        console.warn(`Auto action ${id} warning:`, err.message);
      }
    }
  } finally {
    autoRunInFlight = false;
  }
}

function syncProcessEnv(env) {
  if (!globalThis.process) {
    globalThis.process = { env: {} };
  }
  if (!globalThis.process.env) {
    globalThis.process.env = {};
  }
  const target = globalThis.process.env;
  for (const [k, v] of Object.entries(workerEnv || {})) {
    if (typeof v === "string" && v && !target[k]) {
      target[k] = v;
    }
  }
  for (const [k, v] of Object.entries(env || {})) {
    if (typeof v === "string" && v) {
      target[k] = v;
    }
  }
  if (!target.GEMINI_API_KEY && target.VITE_GEMINI_API_KEY) {
    target.GEMINI_API_KEY = target.VITE_GEMINI_API_KEY;
  }
  if (!target.SUPABASE_URL && target.VITE_SUPABASE_URL) {
    target.SUPABASE_URL = target.VITE_SUPABASE_URL;
  }
  if (!target.SUPABASE_SECRET_KEY && target.VITE_SUPABASE_ANON_KEY) {
    target.SUPABASE_SECRET_KEY = target.VITE_SUPABASE_ANON_KEY;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function resolveHighResImageUrl(sourceUrl) {
  let target = sourceUrl;
  if (target.startsWith("/api/enhance-image?url=")) {
    try {
      target =
        new URL(target, "http://localhost").searchParams.get("url") || target;
    } catch {
      // ignore
    }
  }
  return target;
}

const yandexPreviewCache = new Map();

function getWorkerWordStem(word) {
  if (!word || word.length < 4) return word;
  const stem = word.replace(
    /(?:ами|ями|ого|его|ому|ему|ыми|ими|ным|ним|ная|ное|ные|ных|ной|ней|ский|ская|ское|ские|ских|ской|ского|ов|ев|ей|ам|ям|ах|ях|ом|ем|ой|ей|ия|ию|ии|ие|а|я|ы|и|е|у|ю|о)$/iu,
    ""
  );
  return stem.length >= 3 ? stem : word;
}

function buildWorkerSearchOr(query) {
  const raw = (query || "").trim();
  const tokens = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return "";

  const cleanPhrase = tokens.join(" ");
  const conditions = [];
  const textFields = [
    "name",
    "publisher",
    "info->>author",
    "info->>series",
    "info->>genre",
  ];

  if (cleanPhrase.length >= 2) {
    for (const f of textFields) {
      conditions.push(`${f}.ilike.*${cleanPhrase}*`);
    }
  }

  if (tokens.length > 1) {
    const fwd = `*${tokens.join("*")}*`;
    const rev = `*${[...tokens].reverse().join("*")}*`;
    conditions.push(`name.ilike.${fwd}`, `name.ilike.${rev}`);
    conditions.push(`info->>author.ilike.${fwd}`, `info->>author.ilike.${rev}`);
    conditions.push(`info->>series.ilike.${fwd}`, `info->>series.ilike.${rev}`);
  }

  const processedTokens = new Set();
  for (const t of tokens) {
    if (t.length >= 2) processedTokens.add(t);
    const stem = getWorkerWordStem(t);
    if (stem.length >= 3) processedTokens.add(stem);
  }

  for (const term of processedTokens) {
    conditions.push(`name.ilike.*${term}*`);
    conditions.push(`info->>author.ilike.*${term}*`);
    conditions.push(`info->>series.ilike.*${term}*`);
    if (term.length >= 3) {
      conditions.push(`publisher.ilike.*${term}*`);
      conditions.push(`info->>code.ilike.*${term}*`);
      conditions.push(`info->>isbn.ilike.*${term}*`);
    }
  }

  return `(${conditions.join(",")})`;
}

async function handleEnhanceImage(request, urlObj, ctx) {
  const sourceUrl = urlObj.searchParams.get("url") || "";
  if (!sourceUrl) {
    return jsonResponse({ error: "Invalid image URL" }, 400);
  }

  const cache = globalThis.caches?.default;
  if (cache) {
    try {
      const cachedRes = await cache.match(request);
      if (cachedRes) return cachedRes;
    } catch {
      // ignore cache read errors
    }
  }

  let resolved = resolveHighResImageUrl(sourceUrl);

  // AST code pattern: ASE or AST followed by digits
  const astMatch = resolved.match(/(AS[ET]\d{6,18})/i);
  if (astMatch) {
    resolved = `https://cdn.ast.ru/v2/${astMatch[1].toUpperCase()}/COVER/cover1__w340.jpg`;
    return Response.redirect(resolved, 302);
  }

  // Yandex Disk public view links
  if (resolved.includes("disk.yandex.") || resolved.includes("disk.360.yandex.")) {
    const cachedYandex = yandexPreviewCache.get(resolved);
    if (cachedYandex && Date.now() - cachedYandex.time < 12 * 3600 * 1000) {
      return Response.redirect(cachedYandex.url, 302);
    }

    try {
      const yApi = `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(resolved)}&preview_size=L`;
      const yRes = await fetch(yApi);
      if (yRes.ok) {
        const yData = await yRes.json();
        const previewUrl = yData?.preview || yData?.file;
        if (previewUrl) {
          yandexPreviewCache.set(resolved, { url: previewUrl, time: Date.now() });
          return Response.redirect(previewUrl, 302);
        }
      }
    } catch {
      // fallback
    }

    return jsonResponse({ error: "Image not available on storage" }, 404);
  }

  // Direct fast redirect for external HTTP images
  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    return Response.redirect(resolved, 302);
  }

  return jsonResponse({ error: "Could not load image" }, 404);
}

export default {
  async scheduled(event, env, ctx) {
    syncProcessEnv(env);
    const task = runScheduledCatalogActions();
    if (ctx?.waitUntil) {
      ctx.waitUntil(task);
    } else {
      await task;
    }
  },

  async fetch(request, env, ctx) {
    syncProcessEnv(env);

    const urlObj = new URL(request.url);
    const { pathname } = urlObj;
    const method = request.method.toUpperCase();

    if (method === "GET" && pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (method === "POST" && pathname === "/api/warmup") {
      return jsonResponse({ ready: true });
    }

    if (method === "GET" && pathname === "/api/enhance-image") {
      return handleEnhanceImage(request, urlObj, ctx);
    }

    if (method === "GET" && pathname === "/api/catalog-status") {
      return jsonResponse({
        latest_catalog_update: "2026-10-30 16:44:35",
        total_catalogs: 210,
      });
    }

    if (method === "GET" && pathname === "/api/search-books") {
      const q = urlObj.searchParams.get("q") ?? "";
      try {
        const orClause = buildWorkerSearchOr(q);
        const targetUrl = q.trim() && orClause
          ? `https://qgxiisgzwcsevzyaoxvl.supabase.co/rest/v1/books?select=id,name,price,publisher,image,info&or=${encodeURIComponent(orClause)}&order=id.asc&limit=150`
          : `https://qgxiisgzwcsevzyaoxvl.supabase.co/rest/v1/books?select=id,name,price,publisher,image,info&order=id.asc&limit=100`;
        const sRes = await fetch(targetUrl, {
          headers: {
            apikey: "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw",
            Authorization: "Bearer sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw",
          },
        });
        const rows = sRes.ok ? await sRes.json() : [];
        return jsonResponse({ products: rows });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "GET" && pathname === "/api/book-details") {
      const id = urlObj.searchParams.get("id");
      try {
        const targetUrl = id
          ? `https://qgxiisgzwcsevzyaoxvl.supabase.co/rest/v1/books?select=id,name,price,publisher,image,info&id=eq.${id}&limit=1`
          : `https://qgxiisgzwcsevzyaoxvl.supabase.co/rest/v1/books?select=id,name,price,publisher,image,info&limit=1`;
        const sRes = await fetch(targetUrl, {
          headers: {
            apikey: "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw",
            Authorization: "Bearer sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw",
          },
        });
        const rows = sRes.ok ? await sRes.json() : [];
        return jsonResponse({ product: rows[0] || null });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "POST" && pathname === "/api/litera-chat") {
      try {
        const body = await request.json().catch(() => ({}));
        const isSse = request.headers.get("accept")?.includes("text/event-stream");

        if (isSse) {
          const encoder = new TextEncoder();
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();

          const runAsync = async () => {
            try {
              const onStatus = (status) => {
                writer
                  .write(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "status", status })}\n\n`,
                    ),
                  )
                  .catch(() => {});
              };
              const result = await processLiteraChat({ ...body, onStatus });
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "result", ...result })}\n\n`,
                ),
              );
            } catch (err) {
              await writer
                .write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "result",
                      message:
                        body?.language === "en"
                          ? "Oops, it seems there was a minor connection glitch! 💜 Please try asking again."
                          : "Ой, кажется, произошла небольшая заминка со связью! 💜 Пожалуйста, попробуйте отправить вопрос ещё раз.",
                      emotion: "concerned",
                      books: [],
                    })}\n\n`,
                  ),
                )
                .catch(() => {});
            } finally {
              await writer.close().catch(() => {});
            }
          };

          runAsync();

          return new Response(readable, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            },
          });
        }

        const result = await processLiteraChat(body);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse(
          {
            error: "Litera assistant failed to respond",
            message: err.message,
          },
          500,
        );
      }
    }

    if (method === "POST" && pathname === "/api/litera-translate") {
      try {
        const body = await request.json().catch(() => ({}));
        const result = await translateLiteraDialog({
          messages: body?.messages,
          targetLanguage: body?.targetLanguage,
        });
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ translations: [], error: err.message }, 500);
      }
    }

    if (method === "POST" && pathname === "/api/filter-inquiry-message") {
      try {
        const body = await request.json().catch(() => ({}));
        const { text, language } = body || {};
        const result = await filterInquiryMessageWithAI({ text, language });
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse(
          {
            allowed: false,
            reason: "Ошибка проверки сообщения. Пожалуйста, попробуйте еще раз.",
            message: err.message,
          },
          500,
        );
      }
    }

    if (method === "POST" && pathname === "/api/send-inquiry-email") {
      try {
        const body = await request.json().catch(() => ({}));
        const { to, userName, subject, text, adminName } = body || {};
        if (!to || !text) {
          return jsonResponse(
            { error: "Missing required fields: to, text" },
            400,
          );
        }
        const result = await sendGuestInquiryEmail({
          to,
          userName,
          subject,
          text,
          adminName,
        });
        return jsonResponse({ success: true, result });
      } catch (err) {
        return jsonResponse(
          {
            error: "Failed to send inquiry email",
            message: err.message,
          },
          500,
        );
      }
    }

    if (method === "GET" && pathname === "/api/actions-status") {
      return jsonResponse({ actions: actionStatuses });
    }

    if (method === "POST" && pathname === "/api/run-action") {
      try {
        const body = await request.json().catch(() => ({}));
        const actionId = body?.actionId;
        const action = ACTIONS[actionId];
        if (!action) {
          return jsonResponse({ error: `Unknown action: ${actionId}` }, 400);
        }
        const runPromise = triggerSingleAction(actionId).catch(() => {});
        if (ctx?.waitUntil) {
          ctx.waitUntil(runPromise);
        }
        return jsonResponse({
          success: true,
          method: "auto-worker",
          message: `Started ${action.name}`,
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (method === "POST" && pathname === "/api/dedupe-books") {
      try {
        const body = await request.json().catch(() => ({}));
        const books = Array.isArray(body?.books) ? body.books : [];
        return jsonResponse({ books });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
