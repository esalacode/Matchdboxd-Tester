// /api/diary?user=<username>&maxPages=50
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
const blocked = t => /cloudflare|just a moment|attention required/i.test(t || "");

const normUser = u => {
  if (!u) return null;
  u = String(u).trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_-]{1,30}$/i.test(u) ? u : null;
};

const fetchText = async url => {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`fetch ${r.status} ${url}`);
  return r.text();
};

// --- RSS first (mirrors the linked project’s approach) -----------------------
function parseRSS(xml) {
  const out = [];
  let m;
  const reLB = /<letterboxd:watchedDate>(\d{4})-\d{2}-\d{2}<\/letterboxd:watchedDate>/g;
  while ((m = reLB.exec(xml))) out.push(+m[1]);
  if (out.length) return out;
  const rePub = /<pubDate>([^<]+)<\/pubDate>/g; // fallback
  while ((m = rePub.exec(xml))) {
    const d = new Date(m[1]);
    if (!isNaN(d)) out.push(d.getUTCFullYear());
  }
  return out;
}

// --- HTML fallback -----------------------------------------------------------
function parseDiaryHTML(html) {
  const $ = cheerio.load(html);
  const years = [];
  $('time[datetime]').each((_, el) => {
    const dt = $(el).attr('datetime') || "";
    if (/^\d{4}-\d{2}-\d{2}/.test(dt)) years.push(+dt.slice(0,4));
  });
  return years;
}

module.exports = async (req, res) => {
  try {
    const user = normUser(req.query.user);
    const maxPages = Math.max(1, Math.min(500, +(req.query.maxPages || 50)));
    if (!user) return res.status(400).json({ error: "invalid user" });

    const counts = {};

    // 1) RSS
    try {
      const rss = await fetchText(`https://letterboxd.com/${encodeURIComponent(user)}/rss/`);
      if (!blocked(rss)) {
        for (const y of parseRSS(rss)) counts[y] = (counts[y] || 0) + 1;
      }
    } catch (_) { /* proceed to HTML */ }

    // 2) HTML pages if RSS empty
    if (Object.keys(counts).length === 0) {
      const base = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/`;
      for (let p = 1; p <= maxPages; p++) {
        const url = p === 1 ? base : `${base}page/${p}/`;
        const html = await fetchText(url);
        if (blocked(html)) break;
        const years = parseDiaryHTML(html);
        if (!years.length) break;
        years.forEach(y => counts[y] = (counts[y] || 0) + 1);
        await sleep(300);
      }
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ user, years: counts });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
