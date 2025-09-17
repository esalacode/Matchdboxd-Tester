// /api/diary?user=<username>&from=1990&to=2030
const cheerio = require("cheerio");

const H = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Pragma": "no-cache",
  "Cache-Control": "no-cache",
  "Referer": "https://letterboxd.com/"
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const blocked = t => /cloudflare|just a moment|attention required/i.test(t || "");

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
  const m = (html||"").match(new RegExp(`logged\\s+(\\d+)\\s+entries\\s+for\\s+films\\s+during\\s+${y}`, "i"));
  return m ? +m[1] : null;
}

function countTimes(html, y){
  const $ = cheerio.load(html||"");
  let n = 0;
  $("time[datetime]").each((_, el) => {
    const dt = $(el).attr("datetime") || "";
    if (dt.startsWith(String(y))) n++;
  });
  return n;
}

async function countYear(user, y){
  const base = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/for/${y}/`;

  let html = await fetchText(base);
  if (!html || blocked(html)) return {count:0, blocked:true};

  const hdr = headerCount(html, y);
  if (hdr != null) return {count: hdr, blocked:false};

  // Fallback: paginate that year completely
  let total = 0, page = 1;
  while (true){
    const url = page === 1 ? base : `${base}page/${page}/`;
    if (page > 1){ html = await fetchText(url); if (!html) break; if (blocked(html)) return {count:total, blocked:true}; }
    const n = countTimes(html, y);
    if (n === 0) break;
    total += n;
    page++;
    if (page > 300) break;
    await sleep(250);
  }
  return {count: total, blocked:false};
}

module.exports = async (req, res) => {
  try{
    const user = normUser(req.query.user);
    if (!user) return res.status(400).json({ error:"invalid user" });

    const now  = new Date().getFullYear();
    const to   = Math.min(now, +(req.query.to || now));
    const from = Math.max(1950, +(req.query.from || (to - 30)));

    const years = {};
    let sawBlock = false;

    for (let y = to; y >= from; y--){
      const {count, blocked:blk} = await countYear(user, y);
      if (blk) sawBlock = true;
      if (count > 0) years[y] = count;
      await sleep(150);
    }

    res.setHeader("Cache-Control","no-store");
    res.status(200).json({ user, years, blocked: sawBlock });
  }catch(e){
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
