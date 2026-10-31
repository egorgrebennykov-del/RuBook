import axios from "axios";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import sharp from "sharp";
import { dedupeBooks } from "./dedupeBooks.js";
import { warmupImageModel } from "../utils/bookSimilarity.js";
import {
  processLiteraChat,
  filterInquiryMessageWithAI,
  translateLiteraDialog,
} from "./literaAssistantService.js";
import { sendGuestInquiryEmail } from "./emailService.js";
import { executeCatalogActionById } from "./catalogActionsService.js";
import { setHttpAdapter } from "./httpClient.js";
import { syncTransbaltik } from "../scripts/syncTransbaltikBooks.js";

const defaultHttpsAgent = new https.Agent({ rejectUnauthorized: false });
setHttpAdapter({
  get: (url, config = {}) =>
    axios.get(url, { httpsAgent: defaultHttpsAgent, ...config }),
  post: (url, payload, config = {}) =>
    axios.post(url, payload, { httpsAgent: defaultHttpsAgent, ...config }),
});

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.resolve(appDir, ".env") });

const ACTIONS = {
  "update-book-picks": {
    id: "update-book-picks",
    name: "Update Book Picks",
    workflowFile: "update-book-picks.yml",
    script: "updateBookPicks.js",
  },
  "update-home-books": {
    id: "update-home-books",
    name: "Update Homepage Books",
    workflowFile: "update-home-books.yml",
    script: "updateHomepageBooks.js",
  },
  "update-new-books": {
    id: "update-new-books",
    name: "Update New Books",
    workflowFile: "update-new-books.yml",
    script: "updateNewBooks.js",
  },
  "update-exchange-rate": {
    id: "update-exchange-rate",
    name: "Update Exchange Rate",
    workflowFile: "update-exchange-rate.yml",
    script: "updateExchangeRate.js",
  },
  "sync-transbaltik-books": {
    id: "sync-transbaltik-books",
    name: "Sync Transbaltik Books & Rate",
    workflowFile: "sync-transbaltik-books.yml",
    script: "syncTransbaltikBooks.js",
  },
  "update-discounts": {
    id: "update-discounts",
    name: "Update Discount Books",
    workflowFile: "update-discounts.yml",
    script: "updateDiscounts.js",
  },
};

const actionStatuses = {
  "sync-transbaltik-books": { status: "idle", lastRun: null, error: null, output: "" },
  "update-book-picks": { status: "idle", lastRun: null, error: null, output: "" },
  "update-home-books": { status: "idle", lastRun: null, error: null, output: "" },
  "update-new-books": { status: "idle", lastRun: null, error: null, output: "" },
  "update-exchange-rate": { status: "idle", lastRun: null, error: null, output: "" },
  "update-discounts": { status: "idle", lastRun: null, error: null, output: "" },
};
const PORT = Number(process.env.BOOK_COMPARE_PORT) || 3001;
const MAX_BODY_SIZE = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_CACHE_DIR = path.join(appDir, ".cache", "fast-enhanced-images");
const ALLOWED_IMAGE_HOSTS = new Set([
  "transbaltik.ru",
  "www.transbaltik.ru",
  "disk.yandex.ru",
  "downloader.disk.yandex.ru",
  "cloud-api.yandex.net",
  "ast.ru",
  "go.ast.ru",
  "cdn.ast.ru",
  "bubblefiles.storage.yandexcloud.net",
  "covers.openlibrary.org",
]);
const pendingImages = new Map();

function respond(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_SIZE)
      throw new Error("Request body is too large");
  }
  return JSON.parse(body);
}

function validImageUrl(value) {
  try {
    if (typeof value !== "string" || !value) return false;
    if (value.startsWith("/api/enhance-image?url=")) {
      const u = new URL(value, "http://localhost");
      const target = u.searchParams.get("url");
      return validImageUrl(target);
    }
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const nodeYandexPreviewCache = new Map();

async function fetchSourceImage(sourceUrl) {
  let currentUrl = sourceUrl;
  if (currentUrl.includes("disk.yandex.ru/i/")) {
    const cached = nodeYandexPreviewCache.get(currentUrl);
    if (cached && Date.now() - cached.time < 12 * 3600 * 1000) {
      currentUrl = cached.url;
    } else {
      try {
        const yApi = `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(currentUrl)}&preview_size=L`;
        const yRes = await axios.get(yApi, { timeout: 8000 });
        if (yRes.data?.preview || yRes.data?.file) {
          currentUrl = yRes.data.preview || yRes.data.file;
          nodeYandexPreviewCache.set(sourceUrl, { url: currentUrl, time: Date.now() });
        }
      } catch {
        // fallback
      }
    }
  }
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!validImageUrl(currentUrl)) {
      throw new Error("Image redirect points to an unsupported host");
    }

    const response = await axios.get(currentUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: MAX_IMAGE_BYTES,
      maxRedirects: 0,
      family: 4,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Connection: "close",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false, keepAlive: false }),
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status >= 300) {
      const location = response.headers.location;
      if (!location) throw new Error("Image redirect has no location");
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    const image = Buffer.from(response.data);
    if (!image.length || image.length > MAX_IMAGE_BYTES) {
      throw new Error("Image is empty or exceeds the size limit");
    }
    return image;
  }

  throw new Error("Image has too many redirects");
}

function resolveOriginalImageUrl(sourceUrl) {
  if (!sourceUrl) return "";
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

async function getEnhancedImage(sourceUrl) {
  const targetUrl = resolveOriginalImageUrl(sourceUrl);
  const cacheKey = createHash("sha256")
    .update(`sharp-fast-v4:${targetUrl}`)
    .digest("hex");
  const cachePath = path.join(IMAGE_CACHE_DIR, `${cacheKey}.webp`);

  if (pendingImages.has(cacheKey)) return pendingImages.get(cacheKey);
  const task = (async () => {
    try {
      return await readFile(cachePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const original = await fetchSourceImage(targetUrl);
    // Smart upscale small covers with Lanczos3 to 800x1200 without degrading high-res covers
    const metadata = await sharp(original).metadata();
    let sharpPipeline = sharp(original, { limitInputPixels: 40000000 }).rotate();
    if ((metadata.width && metadata.width < 600) || (metadata.height && metadata.height < 900)) {
      sharpPipeline = sharpPipeline
        .resize({
          width: 800,
          height: 1200,
          fit: "inside",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .sharpen({ sigma: 1.1, m1: 1.4, m2: 0.6 });
    }
    const enhanced = await sharpPipeline
      .modulate({ brightness: 1.02, saturation: 1.05 })
      .webp({ quality: 92, effort: 3 })
      .toBuffer();

    await mkdir(IMAGE_CACHE_DIR, { recursive: true });
    await writeFile(cachePath, enhanced);
    return enhanced;
  })();

  pendingImages.set(cacheKey, task);
  try {
    return await task;
  } finally {
    pendingImages.delete(cacheKey);
  }
}

async function handleEnhancedImage(req, res) {
  const sourceUrl = new URL(req.url, "http://localhost").searchParams.get(
    "url",
  );
  if (!sourceUrl || !validImageUrl(sourceUrl)) {
    respond(res, 400, { error: "Unsupported image URL" });
    return;
  }

  try {
    const image = await getEnhancedImage(sourceUrl);
    res.writeHead(200, {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(image);
  } catch (error) {
    console.warn(`Could not enhance image ${sourceUrl}: ${error.message}`);
    respond(res, 502, { error: "Could not load image" });
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/api/enhance-image?")) {
    await handleEnhancedImage(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/catalog-status") {
    try {
      const statusFile = path.resolve(appDir, "public", "catalog-status.json");
      const content = await readFile(statusFile, "utf8");
      respond(res, 200, JSON.parse(content));
    } catch {
      respond(res, 200, {
        latest_catalog_update: "2026-10-30 16:44:35",
        total_catalogs: 210,
      });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/sync-transbaltik") {
    try {
      const result = await syncTransbaltik();
      respond(res, 200, { success: true, ...result });
    } catch (err) {
      console.warn("Manual sync-transbaltik error:", err.message);
      respond(res, 500, { error: err.message });
    }
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/search-books?")) {
    const q = new URL(req.url, "http://localhost").searchParams.get("q") ?? "";
    try {
      const clean = encodeURIComponent(`*${q.trim()}*`);
      const targetUrl = q.trim()
        ? `https://qgxiisgzwcsevzyaoxvl.supabase.co/rest/v1/books?select=id,name,price,publisher,image,info&or=(name.ilike.${clean},publisher.ilike.${clean})&order=id.asc&limit=100`
        : `https://qgxiisgzwcsevzyaoxvl.supabase.co/rest/v1/books?select=id,name,price,publisher,image,info&order=id.asc&limit=100`;
      const sRes = await fetch(targetUrl, {
        headers: {
          apikey: "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw",
          Authorization: "Bearer sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw",
        },
      });
      const rows = sRes.ok ? await sRes.json() : [];
      respond(res, 200, { products: rows });
    } catch (error) {
      respond(res, 500, { error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/book-details?")) {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const id = sp.get("id");
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
      respond(res, 200, { product: rows[0] || null });
    } catch (error) {
      respond(res, 500, { error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    respond(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && req.url === "/api/warmup") {
    try {
      await warmupImageModel();
      respond(res, 200, { ready: true });
    } catch (error) {
      console.error("Image model warmup failed:", error.message);
      respond(res, 503, { error: "Image model is unavailable" });
    }
    return;
  }
  if (req.method === "GET" && req.url === "/api/actions-status") {
    respond(res, 200, { actions: actionStatuses });
    return;
  }

  if (req.method === "POST" && req.url === "/api/run-action") {
    try {
      const body = await readJson(req);
      const actionId = body.actionId;
      const action = ACTIONS[actionId];
      if (!action) {
        respond(res, 400, { error: `Unknown action: ${actionId}` });
        return;
      }
      if (actionStatuses[actionId]?.status === "running") {
        respond(res, 409, { error: "Action is already running" });
        return;
      }

      // If GITHUB_TOKEN is available, try dispatching to GitHub Actions
      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (githubToken && !body.forceLocal) {
        try {
          await axios.post(
            `https://api.github.com/repos/egorgrebennykov-del/KazBook/actions/workflows/${action.workflowFile}/dispatches`,
            { ref: "main" },
            {
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Litera-App",
              },
            },
          );
          actionStatuses[actionId] = {
            status: "success",
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            lastRun: new Date().toISOString(),
            method: "github",
            output: `[${new Date().toLocaleTimeString()}] Successfully dispatched workflow ${action.workflowFile} to GitHub Actions!`,
          };
          respond(res, 200, {
            success: true,
            method: "github",
            message: `Dispatched ${action.name} to GitHub Actions`,
          });
          return;
        } catch (ghErr) {
          console.warn("GitHub Actions dispatch failed, running locally:", ghErr?.response?.data || ghErr.message);
        }
      }

      // Local execution fallback
      const scriptPath = path.resolve(appDir, ".github", action.script);
      actionStatuses[actionId] = {
        status: "running",
        startedAt: new Date().toISOString(),
        lastRun: new Date().toISOString(),
        method: "local",
        output: `[${new Date().toLocaleTimeString()}] Starting ${action.name} (${action.script})...\n`,
        error: null,
      };

      const child = spawn(process.execPath, [scriptPath], {
        cwd: path.resolve(appDir, ".github"),
        env: {
          ...process.env,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
      });

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        const current = actionStatuses[actionId].output || "";
        actionStatuses[actionId].output = (current + text).slice(-30000);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        const current = actionStatuses[actionId].output || "";
        actionStatuses[actionId].output = (current + text).slice(-30000);
      });

      child.on("close", (code) => {
        const finishedAt = new Date().toISOString();
        actionStatuses[actionId].finishedAt = finishedAt;
        if (code === 0) {
          actionStatuses[actionId].status = "success";
          actionStatuses[actionId].output += `\n[${new Date().toLocaleTimeString()}] ${action.name} completed successfully (exit code 0).\n`;
        } else {
          actionStatuses[actionId].status = "error";
          actionStatuses[actionId].error = `Exited with code ${code}`;
          actionStatuses[actionId].output += `\n[${new Date().toLocaleTimeString()}] Error: ${action.name} exited with code ${code}.\n`;
        }
      });

      child.on("error", (err) => {
        actionStatuses[actionId].status = "error";
        actionStatuses[actionId].finishedAt = new Date().toISOString();
        actionStatuses[actionId].error = err.message;
        actionStatuses[actionId].output += `\n[${new Date().toLocaleTimeString()}] Process error: ${err.message}\n`;
      });

      respond(res, 200, {
        success: true,
        method: "local",
        status: "running",
        message: `Action ${action.name} started`,
      });
    } catch (err) {
      console.error("Failed to run action:", err);
      respond(res, 500, { error: err.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/litera-chat") {
    try {
      const body = await readJson(req);
      const isSse = req.headers.accept?.includes("text/event-stream");

      if (isSse) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });

        const onStatus = (status) => {
          res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
        };

        const result = await processLiteraChat({ ...body, onStatus });
        res.write(`data: ${JSON.stringify({ type: "result", ...result })}\n\n`);
        res.end();
        return;
      }

      const result = await processLiteraChat(body);
      respond(res, 200, result);
    } catch (err) {
      console.error("Failed to process Litera chat:", err);
      respond(res, 500, {
        error: "Litera assistant failed to respond",
        message: err.message,
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/send-inquiry-email") {
    try {
      const body = await readJson(req);
      const { to, userName, subject, text, adminName } = body || {};
      if (!to || !text) {
        respond(res, 400, { error: "Missing required fields: to, text" });
        return;
      }
      const result = await sendGuestInquiryEmail({
        to,
        userName,
        subject,
        text,
        adminName,
      });
      respond(res, 200, { success: true, result });
    } catch (err) {
      console.error("Failed to send inquiry email:", err);
      respond(res, 500, {
        error: "Failed to send inquiry email",
        message: err.message,
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/litera-translate") {
    try {
      const body = await readJson(req);
      const result = await translateLiteraDialog({
        messages: body?.messages,
        targetLanguage: body?.targetLanguage,
      });
      respond(res, 200, result);
    } catch (err) {
      console.error("Failed to translate Litera dialog:", err);
      respond(res, 500, { translations: [], error: err.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/filter-inquiry-message") {
    try {
      const body = await readJson(req);
      const { text, language } = body || {};
      const result = await filterInquiryMessageWithAI({ text, language });
      respond(res, 200, result);
    } catch (err) {
      console.error("Failed to filter inquiry message:", err);
      respond(res, 500, {
        allowed: false,
        reason: "Ошибка проверки сообщения. Пожалуйста, попробуйте еще раз.",
        message: err.message,
      });
    }
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/dedupe-books") {
    respond(res, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await readJson(req);
    if (!Array.isArray(body.books) || body.books.length > 150) {
      respond(res, 400, { error: "Expected up to 150 books" });
      return;
    }
    if (
      body.books.some(
        (book) =>
          !book ||
          typeof book.title !== "string" ||
          typeof book.store !== "string" ||
          !validImageUrl(book.image),
      )
    ) {
      respond(res, 400, {
        error: "Books contain invalid image URLs or fields",
      });
      return;
    }

    const books = await dedupeBooks(body.books, String(body.query ?? ""));
    respond(res, 200, { books });
  } catch (error) {
    console.error("Book cover comparison failed:", error.message);
    respond(res, 500, { error: "Could not compare book covers" });
  }
});

async function runAutoCatalogActions() {
  const order = [
    "update-exchange-rate",
    "update-discounts",
    "update-new-books",
    "update-book-picks",
    "update-home-books",
  ];
  for (const id of order) {
    const action = ACTIONS[id];
    if (!action || actionStatuses[id]?.status === "running") continue;
    const startedAt = new Date().toISOString();
    actionStatuses[id] = {
      status: "running",
      startedAt,
      lastRun: startedAt,
      method: "auto",
      output: `[${new Date().toLocaleTimeString()}] Auto-running ${action.name}...\n`,
      error: null,
    };
    try {
      const summary = await executeCatalogActionById(id);
      const finishedAt = new Date().toISOString();
      actionStatuses[id] = {
        status: "success",
        startedAt,
        finishedAt,
        lastRun: finishedAt,
        method: "auto",
        output: `[${new Date().toLocaleTimeString()}] ${summary}\n`,
        error: null,
      };
    } catch (err) {
      const finishedAt = new Date().toISOString();
      actionStatuses[id] = {
        status: "error",
        startedAt,
        finishedAt,
        lastRun: finishedAt,
        method: "auto",
        output: `[${new Date().toLocaleTimeString()}] Error: ${err.message}\n`,
        error: err.message,
      };
    }
  }
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Book cover comparison API listening on ${PORT}`);
});
