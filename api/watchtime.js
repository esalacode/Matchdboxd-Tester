// /api/watchtime.js
// Usage: /api/watchtime?user=<username>&maxPages=200
// Aggregates total watch minutes from the user’s diary by scraping film runtimes.
// Node 18+. Requires: npm i cheerio
const cheerio = require("cheerio");

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
];
const pickUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

const BLOCK_RE = /(Just a moment|Attention Required|cloudflare|Please enable cookies|Checking your browser)/i;
const SEL_DIARY = "tr.diary-entry-row a[href*='/film/'], li.diary-entry a[href*='/film/'], article.diary-entry a[href*='/film/']";
const COOKIE = process.env.LB_COOKIE || "";
const DEFAULT_MAX_PAGES = 200;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function normUser(u){
  if(!u) return null;
  u = String(u).trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_-]{1,30}$/i.test(u) ? u : null;
}

async function getHTML(url, retries = 3){
  for (let i=0; i<=retries; i++){
    const res = await fetch(url, {
      headers: {
        "user-agent": pickUA(),
        "accept": "text/html,application/xhtml+xml",
        "cookie": COOKIE
      }
    });
    const html = await res.text();
    if (BLOCK_RE.test(html)) {
      if (i === retries) throw new Error("Blocked by Cloudflare/anti-bot");
      await sleep(800 + 400*i);
      continue;
    }
    if (!res.ok) {
      if (i === retries) throw new Error(`HTTP ${res.status} for ${url}`);
      await sleep(400);
      continue;
    }
    return html;
  }
  throw new Error("Unreachable");
}

function iso8601ToMinutes(dur){
  // e.g. PT2H14M, PT95M
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(dur || "");
  if (!m) return null;
  const h = m[1] ? +m[1] : 0;
  const mm = m[2] ? +m[2] : 0;
  return h*60 + mm;
}

function sniffRuntimeMinutes(html){
  const $ = cheerio.load(html);

  // 1) schema.org duration
  const iso = $("[itemprop='duration']").attr("content")
         || $("meta[itemprop='duration']").attr("content")
         || $("meta[property='video:duration']").attr("content");
  const isoMin = iso ? iso8601ToMinutes(iso) : null;
  if (Number.isFinite(isoMin)) return isoMin;

  // 2) Text patterns commonly found on film pages
  const text = $.text();
  const m1 = /(\d+)\s*(?:mins?|minutes)\b/i.exec(text);
  if (m1) return +m1[1];

  // 3) “\d+h \d+m” or “\d+h”
  const m2 = /(\d+)\s*h(?:\s*(\d+)\s*m)?/i.exec(text);
  if (m2) return (+m2[1])*60 + (m2[2] ? +m2[2] : 0);

  return null;
}

async function getRuntimeMinutes(filmUrl){
  const html = await getHTML(filmUrl);
  return sniffRuntimeMinutes(html);
}

async function collectDiaryFilmLinks(user, maxPages){
  const hrefs = [];
  for (let page=1; page<=maxPages; page++){
    const url = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/page/${page}/`;
    const html = await getHTML(url);
    const $ = cheerio.load(html);

    const pageLinks = [];
    $(SEL_DIARY).each((_, a) => {
      const href = $(a).attr("href") || "";
      if (href.includes("/film/")) {
        // Normalize to absolute URL without query/fragment
        const u = new URL(href, "https://letterboxd.com").toString().replace(/[#?].*$/, "");
        pageLinks.push(u);
      }
    });

    if (pageLinks.length === 0) break; // no more pages
    hrefs.push(...pageLinks);

    // Be polite and reduce bot flags
    await sleep(300);
  }
  return hrefs;
}

module.exports = async function handler(req, res){
  try{
    const user = normUser(req.query.user);
    if (!user){ res.status(400).json({ error: "Missing or invalid ?user" }); return; }
    const maxPages = Math.max(1, Math.min(DEFAULT_MAX_PAGES, parseInt(req.query.maxPages || DEFAULT_MAX_PAGES, 10) || DEFAULT_MAX_PAGES));

    // 1) collect every diary entry film link
    const hrefs = await collectDiaryFilmLinks(user, maxPages);

    // 2) build rewatch counts with normalized slugs
const counts = new Map(); // canonical "/film/<slug>" -> diary count
for (const h of hrefs) {
  const m = h.match(/\/film\/([^/]+)\/?/);
  if (!m) continue;
  const slug = `/film/${m[1]}`; // canonical key
  counts.set(slug, (counts.get(slug) || 0) + 1);
}

const slugs = Array.from(counts.keys());
const cache = new Map(); // slug -> minutes

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  async function next() {
    const idx = i++;
    if (idx >= items.length) return;
    try { results[idx] = await worker(items[idx], idx); }
    catch (e) { results[idx] = e; }
    return next();
  }
  const starters = Array.from({ length: Math.min(limit, items.length) }, next);
  await Promise.all(starters);
  return results;
}

await runWithConcurrency(slugs, 10, async (slug) => {
  // fetch runtime once per film
  const filmUrl = new URL(`${slug}/`, "https://letterboxd.com").toString();
  let mins = cache.get(slug);
  if (mins == null) {
    try { mins = await getRuntimeMinutes(filmUrl); }
    catch { mins = 0; }
    cache.set(slug, Number.isFinite(mins) ? mins : 0);
  }
});

// sum = runtime * rewatch count
let totalMinutes = 0;
for (const [slug, cnt] of counts.entries()) {
  totalMinutes += (cache.get(slug) || 0) * cnt;
}


res.setHeader("Cache-Control", "public, max-age=1800");
res.status(200).json({
  user,
  logs: hrefs.length,
  minutes: totalMinutes,
  hours: +(totalMinutes / 60).toFixed(2)
});
} catch (e) {
  res.status(500).json({ error: e.message || String(e) });
}
};

// ESM default export compatibility
module.exports.default = module.exports;
