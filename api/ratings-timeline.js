// /api/ratings-timeline.js
// Build a "rating curve over time" for a Letterboxd user, suitable for animation.
// Usage: /api/ratings-timeline?user=<username>&maxPages=80
// Response: { user, bins, frames[] } where each frame has cumulative counts per star bin.

const cheerio = require("cheerio");

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
];
const pickUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];

const BLOCK_RE =
  /(Just a moment|Attention Required|cloudflare|Please enable cookies|Checking your browser)/i;

const COOKIE = process.env.LB_COOKIE || "";
const DEFAULT_MAX_PAGES = 80;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normUser(u) {
  if (!u) return null;
  u = String(u).trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_-]{1,30}$/i.test(u) ? u : null;
}

async function getHTML(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
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
      await sleep(800 + 400 * i);
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

// --- rating extraction helpers (mirrors /api/ratings.js) ---------------------

function extractStarsText($root) {
  const candidates = [
    "p.poster-viewingdata",
    "span[class*=rating]",
    ".rating",
    ".diary-entry-rating"
  ];
  for (const sel of candidates) {
    const t = $root.find(sel).first().text().trim();
    if (/[★½]/.test(t)) {
      const m = t.match(/([★½]+)/);
      if (m) return m[1];
    }
  }
  const m = $root.text().match(/([★½]+)/);
  return m ? m[1] : "";
}

function starsTextToFloat(s) {
  if (!s) return null;
  const stars = (s.match(/★/g) || []).length;
  const half = /½/.test(s) ? 0.5 : 0;
  const val = stars + half;
  return val > 0 ? val : null;
}

// --- parse diary pages into dated ratings -----------------------------------

const SEL_ENTRY = "tr.diary-entry-row, li.diary-entry, article.diary-entry";

function parseDiaryPage(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $(SEL_ENTRY).each((_, el) => {
    const $el = $(el);
    const dt = ($el.find("time[datetime]").attr("datetime") || "").trim();
    if (!dt) return;

    const ratingText = extractStarsText($el);
    const rating = starsTextToFloat(ratingText);
    if (rating == null) return;

    rows.push({
      dateTime: dt,
      rating
    });
  });

  return rows;
}

async function collectDatedRatings(user, maxPages) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const base = `https://letterboxd.com/${encodeURIComponent(
      user
    )}/films/diary/`;
    const url = page === 1 ? base : `${base}page/${page}/`;
    const html = await getHTML(url);
    const rows = parseDiaryPage(html);
    if (!rows.length) break;
    all.push(...rows);
    await sleep(300);
  }
  // oldest → newest
  all.sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  return all;
}

// --- build cumulative histogram frames --------------------------------------

function buildHistogramFrames(user, entries) {
  // 0.5, 1.0, 1.5, ..., 5.0
  const bins = [];
  for (let v = 0.5; v <= 5.0 + 1e-9; v += 0.5) {
    bins.push(+v.toFixed(1));
  }
  const keys = bins.map((b) => b.toFixed(1));
  const counts = {};
  for (const k of keys) counts[k] = 0;

  const frames = [];
  for (const e of entries) {
    const key = e.rating.toFixed(1);
    if (!counts.hasOwnProperty(key)) continue;
    counts[key] += 1;

    frames.push({
      dateTime: e.dateTime,
      rating: e.rating,
      counts: keys.map((k) => counts[k])
    });
  }

  return { user, bins, frames };
}

// --- main handler -----------------------------------------------------------

module.exports = async function handler(req, res) {
  try {
    const user = normUser(req.query.user);
    if (!user) {
      res
        .status(400)
        .json({ error: "Missing or invalid ?user=<letterboxd username>" });
      return;
    }
    const maxPages = Math.max(
      1,
      Math.min(
        DEFAULT_MAX_PAGES,
        parseInt(req.query.maxPages || DEFAULT_MAX_PAGES, 10) ||
          DEFAULT_MAX_PAGES
      )
    );

    const entries = await collectDatedRatings(user, maxPages);
    const payload = buildHistogramFrames(user, entries);

    res.setHeader("Cache-Control", "public, max-age=900");
    res.status(200).json(payload);
  } catch (e) {
    res
      .status(500)
      .json({ error: e && e.message ? e.message : String(e || "Error") });
  }
};

// ESM default export compatibility
module.exports.default = module.exports;