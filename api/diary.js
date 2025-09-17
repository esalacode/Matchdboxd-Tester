// /api/diary?user=<username>&maxPages=50
const cheerio = require("cheerio");

const UA = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
];
const ua = () => UA[Math.floor(Math.random()*UA.length)];
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

function normUser(u){
  if(!u) return null;
  u = String(u).trim().replace(/^@/,"").toLowerCase();
  return /^[a-z0-9_-]{1,30}$/i.test(u) ? u : null;
}

function parseDiaryPage(html){
  const $ = cheerio.load(html);
  const items = [];
  const sel = "tr.diary-entry-row time[datetime], li.diary-entry time[datetime], article.diary-entry time[datetime]";
  $(sel).each((_, el) => {
    const dt = $(el).attr("datetime");
    if (!dt || !/^\d{4}-\d{2}-\d{2}/.test(dt)) return;
    items.push({ yearLogged: +dt.slice(0,4), logged: dt });
  });
  return items;
}

module.exports = async (req, res) => {
  try{
    const user = normUser(req.query.user);
    const maxPages = Math.max(1, Math.min(500, +(req.query.maxPages || 50)));
    if(!user){ res.status(400).json({ error:"invalid user" }); return; }

    const all = [];
    const base = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/`;
    for (let page=1; page<=maxPages; page++){
      const url = page===1 ? base : `${base}page/${page}/`;
      const r = await fetch(url, { headers: { "User-Agent": ua(), "Accept": "text/html,*/*" }});
      if (!r.ok){
        if (page === 1) { res.status(r.status).json({ error:`fetch failed`, status:r.status, url }); return; }
        break;
      }
      const html = await r.text();
      const items = parseDiaryPage(html);
      if (items.length === 0) break;
      all.push(...items);
      await sleep(400);
    }

    // Aggregate counts by year
    const counts = {};
    for(const it of all){
      counts[it.yearLogged] = (counts[it.yearLogged]||0)+1;
    }
    res.setHeader("Cache-Control","no-store");
    res.status(200).json({ user, count: all.length, years: counts, itemsSample: all.slice(0,5) });
  }catch(e){
    res.status(500).json({ error:String(e && e.message || e) });
  }
};
