import dotenv from "dotenv";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

function fetchHttpsText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchHttpsText(res.headers.location));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`Failed to fetch: HTTP ${res.statusCode}`));
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve(body));
      },
    );
    req.on("error", reject);
    req.setTimeout(25000, () => {
      req.destroy(new Error("Request timeout"));
    });
  });
}

async function updateExchangeRate() {
  try {
    const supabaseUrl =
      process.env.SUPABASE_URL || "https://qgxiisgzwcsevzyaoxvl.supabase.co";
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false },
    });

    console.log("[ExchangeRate] Fetching transbaltik.ru/pricelists for EUR/RUB rate...");
    const html = await fetchHttpsText("https://www.transbaltik.ru/pricelists");

    let rate = 84.0;
    const match = html.match(/КУРС\s*EUR\/RUB:\s*([\d.,]+)/i);
    if (match && match[1]) {
      const parsed = Number(match[1].replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0) {
        rate = parsed;
      }
    }

    console.log(`[ExchangeRate] Detected EUR/RUB rate: ${rate}`);
    const rateDate = new Date().toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("exchange_rate")
      .select("id")
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from("exchange_rate")
        .update({
          base_currency: "EUR",
          quote_currency: "RUB",
          rate,
          rate_date: rateDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id);

      if (error) throw error;
      console.log(`[ExchangeRate] Successfully updated exchange rate id ${existing[0].id} to ${rate}`);
    } else {
      const { error } = await supabase.from("exchange_rate").insert({
        base_currency: "EUR",
        quote_currency: "RUB",
        rate,
        rate_date: rateDate,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      console.log(`[ExchangeRate] Successfully inserted new exchange rate row: ${rate}`);
    }
  } catch (err) {
    console.error("[ExchangeRate] Error updating exchange rate:", err);
    process.exit(1);
  }
}

updateExchangeRate();
