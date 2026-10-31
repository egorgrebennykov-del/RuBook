import fs from 'node:fs';
import https from 'node:https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SUPABASE_URL = "https://qgxiisgzwcsevzyaoxvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        ...(options.headers || {})
      },
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        }
      });
    }).on('error', reject);
  });
}

function cleanIsbn(val) {
  if (!val) return '';
  const cleaned = String(val).replace(/[^0-9X]/gi, '').toUpperCase();
  if (cleaned.length === 10 || cleaned.length === 13) return cleaned;
  return '';
}

async function run() {
  console.log("Analyzing books with ISBN in database...");

  // Fetch in pages of 1000
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  const allBooks = [];

  while (hasMore) {
    const url = `${SUPABASE_URL}/rest/v1/books?select=id,price,publisher,name,image,info&limit=${pageSize}&offset=${page * pageSize}`;
    const res = await fetchJson(url);
    if (!res.json || res.json.length === 0) {
      hasMore = false;
      break;
    }
    allBooks.push(...res.json);
    console.log(`Fetched page ${page + 1}: ${res.json.length} books (total: ${allBooks.length})`);
    if (res.json.length < pageSize) {
      hasMore = false;
      break;
    }
    page++;
  }

  console.log(`Total books fetched: ${allBooks.length}`);

  // Group by clean ISBN
  const isbnGroups = new Map();
  for (const b of allBooks) {
    const rawIsbn = b.info?.isbn || b.info?.isbn13 || b.info?.isbn10;
    const isbn = cleanIsbn(rawIsbn);
    if (!isbn) continue;

    if (!isbnGroups.has(isbn)) {
      isbnGroups.set(isbn, []);
    }
    isbnGroups.get(isbn).push(b);
  }

  console.log(`Unique ISBN groups found: ${isbnGroups.size}`);

  const toDeleteIds = [];
  let duplicateGroupsCount = 0;

  for (const [isbn, list] of isbnGroups.entries()) {
    if (list.length > 1) {
      duplicateGroupsCount++;
      // Sort by price ascending, then prefer one with image, then lowest id
      list.sort((a, b) => {
        const priceA = Number(a.price) || 999999;
        const priceB = Number(b.price) || 999999;
        if (Math.abs(priceA - priceB) > 0.001) {
          return priceA - priceB; // cheapest first
        }
        if (a.image && !b.image) return -1;
        if (!a.image && b.image) return 1;
        return a.id - b.id;
      });

      const winner = list[0];
      const losers = list.slice(1);
      for (const loser of losers) {
        toDeleteIds.push(loser.id);
      }
    }
  }

  console.log(`Found ${duplicateGroupsCount} ISBN groups with duplicates.`);
  console.log(`Total duplicate book IDs to delete: ${toDeleteIds.length}`);

  if (toDeleteIds.length > 0) {
    console.log(`Deleting ${toDeleteIds.length} duplicate books in batches...`);
    // Delete in batches of 100
    const batchSize = 100;
    let deletedCount = 0;
    for (let i = 0; i < toDeleteIds.length; i += batchSize) {
      const chunk = toDeleteIds.slice(i, i + batchSize);
      const delUrl = `${SUPABASE_URL}/rest/v1/books?id=in.(${chunk.join(',')})`;
      const delRes = await new Promise((resolve, reject) => {
        const req = https.request(delUrl, {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          },
          rejectUnauthorized: false
        }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
      });

      if (delRes >= 200 && delRes < 300) {
        deletedCount += chunk.length;
        console.log(`Deleted batch ${Math.floor(i / batchSize) + 1}: ${deletedCount}/${toDeleteIds.length}`);
      } else {
        console.warn(`Delete batch failed with status ${delRes}`);
      }
    }
    console.log(`🎉 Finished ISBN deduplication! Deleted ${deletedCount} higher-priced duplicates.`);
  }
}

run().catch(console.error);
