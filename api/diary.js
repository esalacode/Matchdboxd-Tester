// /api/diary.js
// Node 18+ (built-in fetch). Install: npm i cheerio
const cheerio = require("cheerio");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const BLOCK_RE = /(Just a moment|Attention Required|cloudflare|Please enable cookies)/i;
const SEL =
  "tr.diary-entry-row time[datetime], li.diary-entry time[datetime], article.diary-entry time[datetime]";
const MAX_PAGES = 60; // safety

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getHTML(url, retry = 1) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.7",
      "cache-control": "no-cache",
    },
  });
  const html = await res.text();
  if (BLOCK_RE.test(html) && retry > 0) {
    await sleep(600 + Math.random() * 600);
    return getHTML(url, retry - 1);
  }
  return html;
}

function headerCount(html, year) {
  // Examples: “Gage has logged 124 entries for films during 2025.”
  const text = cheerio.load(html)("body").text().replace(/\s+/g, " ");
  const m = new RegExp(
    `has\\s+logged\\s+([\\d,]+)\\s+entries\\s+for\\s+films\\s+during\\s+${year}`,
    "i"
  ).exec(text);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

function pageYearMatches(html, year) {
  const $ = cheerio.load(html);
  let n = 0;
  $(SEL).each((_, el) => {
    const dt = ($(el).attr("datetime") || "").slice(0, 4);
    if (dt === String(year)) n++;
  });
  return n;
}

async function countYear(user, year) {
  // 1) Try header (1 request)
  const base = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/for/${year}/`;
  let html = await getHTML(base, 1);
  let fromHeader = headerCount(html, year);
  if (Number.isInteger(fromHeader)) return fromHeader;

  // 2) Paginate and count <time datetime> (page/2, page/3, …) until zero matches
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? base : `${base}page/${page}/`;
    html = await getHTML(url, 1);
    if (BLOCK_RE.test(html)) {
      // skip this year if blocked after retry
      break;
    }
    const hits = pageYearMatches(html, year);
    if (hits === 0) break;
    total += hits;
    // be polite to CF
    await sleep(200 + Math.random() * 300);
  }
  return total;
}

// Discover actual diary years from the archive page
async function fetchDiaryYears(user) {
  const url = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/`;
  const html = await getHTML(url, 1);
  if (BLOCK_RE.test(html)) return []; // fallback handled by resolver
  const $ = cheerio.load(html);
  const set = new Set();
  $('a[href*="/films/diary/for/"]').each((_, a) => {
    const href = String($(a).attr("href") || "");
    const m = href.match(/\/for\/(\d{4})\//);
    if (m) set.add(+m[1]);
  });
  return Array.from(set).sort((a, b) => a - b);
}

// Resolve [from..to] using discovered years, clamping any query params
async function resolveYearRange(user, q) {
  const nowY = new Date().getFullYear();
  const years = await fetchDiaryYears(user);
  const minY = years.length ? years[0] : 2011;
  const maxY = years.length ? years[years.length - 1] : nowY;

  let from = Number.isInteger(+q.from) ? +q.from : minY;
  let to   = Number.isInteger(+q.to)   ? +q.to   : maxY;
  if (from > to) [from, to] = [to, from];

  from = Math.max(minY, Math.min(from, maxY));
  to   = Math.max(minY, Math.min(to,   maxY));
  return [from, to];
}

async function buildYears(user, from, to) {
  const years = {};
  for (let y = from; y <= to; y++) {
    try {
      years[y] = await countYear(user, y);
    } catch {
      years[y] = 0; // hard fail -> zero for that year
    }
    await sleep(150 + Math.random() * 200);
  }
  return years;
}

// Works for Express (req,res) and Next.js API routes.
module.exports = async function diary(req, res) {
  try {
    const q = req.query || {};
    const user = (q.user || "").trim();
    if (!user) {
      res.status(400).json({ error: "Missing ?user" });
      return;
    }
    const [from, to] = await resolveYearRange(user, q);
    const years = await buildYears(user, from, to);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ user, years });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};

// ESM default export compatibility
module.exports.default = module.exports;
