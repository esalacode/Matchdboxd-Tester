// /api/diary?user=<username>&from=2005&to=2025
const cheerio = require("cheerio");

const H = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Referer": "https://letterboxd.com/"
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function normUser(u){
  if(!u) return null;
  u = String(u).trim().replace(/^@/,"").toLowerCase();
  return /^[a-z0-9_-]{1,30}$/i.test(u) ? u : null;
}

async function fetchText(url){
  const r = await fetch(url, { headers: H });
  if (!r.ok) return null;
  return r.text();
}

function headerCount(html, y){
  // e.g., "You've logged 59 entries for films during 2025."
  const re = new RegExp(`logged\\s+(\\d+)\\s+entries\\s+for\\s+films\\s+during\\s+${y}`, "i");
  const m = (html || "").match(re);
  return m ? +m[1] : null;
}

function countDatetimesForYear(html, y){
  const $ = cheerio.load(html || "");
  let n = 0;
  $('time[datetime]').each((_, el) => {
    const dt = $(el).attr('datetime') || "";
    if (dt.startsWith(String(y))) n++;
  });
  return n;
}

async function countYear(user, y){
  const base = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/for/${y}/`;

  // 1) Try header number (single request, exact)
  let html = await fetchText(base);
  if (!html) return 0;
  const hdr = headerCount(html, y);
  if (hdr != null) return hdr;

  // 2) Fallback: paginate and count all rows for that year
  let total = 0, page = 1;
  while (true){
    const url = page === 1 ? base : `${base}page/${page}/`;
    if (page > 1) { html = await fetchText(url); if (!html) break; }
    const n = countDatetimesForYear(html, y);
    if (n === 0) break;
    total += n;
    page++;
    if (page > 300) break;  // hard cap
    await sleep(250);
  }
  return total;
}

module.exports = async (req, res) => {
  try{
    const user = normUser(req.query.user);
    if (!user) return res.status(400).json({ error: "invalid user" });

    const now = new Date().getFullYear();
    const to   = Math.min(now, +(req.query.to || now));
    const from = Math.max(1950, +(req.query.from || (to - 30))); // last 31 years by default

    const years = {};
    for (let y = to; y >= from; y--){
      const c = await countYear(user, y);
      if (c > 0) years[y] = c;
    }

    res.setHeader("Cache-Control","no-store");
    res.status(200).json({ user, years });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
