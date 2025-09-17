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

//function parseDiaryPage(html){
//  const $ = cheerio.load(html);
//  const items = [];
//  // Be liberal: grab ISO dates from any diary row (<tr>|<li>|<article>) time tags
//  $("tr time[datetime], li time[datetime], article time[datetime]").each((_, el) => {
//    const dt = ($(el).attr("datetime") || "").trim();
//    const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})/);
//    if (!m) return;
//    items.push({ yearLogged: +m[1], logged: dt.slice(0,10) });
//  });
//  return items;
//}

function parseDiaryPage(html){
  const $ = cheerio.load(html);
  const items = [];
  const MONTH = {
    january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
    july:"07", august:"08", september:"09", october:"10", november:"11", december:"12"
  };

  $("tr.diary-entry-row, li.diary-entry, article.diary-entry").each((_, row) => {
    // 1) <time datetime="YYYY-MM-DD">
    let dt = ($(row).find("time[datetime]").attr("datetime") || "").trim();

    // 2) Link like /diary/2025/may/16/ → build YYYY-MM-DD
    if (!dt) {
      const href = ($(row).find("a[href*='/diary/']").attr("href") || "");
      const m = href.match(/\/diary\/(\d{4})\/([a-z]+)\/(\d{1,2})\//i);
      if (m) {
        const y = m[1];
        const mm = MONTH[(m[2]||"").toLowerCase()];
        const dd = String(+m[3]).padStart(2,"0");
        if (mm) dt = `${y}-${mm}-${dd}`;
      }
    }

    // 3) Last resort: any ISO date text inside the row
    if (!dt) {
      const m = ($(row).text() || "").match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
      if (m) dt = m[0];
    }

    const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return;
    items.push({ yearLogged: +m[1], logged: dt.slice(0,10) });
  });

  return items;
}

async function fetchDiaryPage(user, page){
  const base = `https://letterboxd.com/${user}/films/diary/`;
  const url = page>1 ? `${base}page/${page}/` : base;
  const res = await fetch(url, {
    headers: {
      "User-Agent": ua(),
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9"
    },
    redirect: "follow"
  });
  if(!res.ok) return { ok:false, status:res.status, url };
  const html = await res.text();
  return { ok:true, html, url };
}

module.exports = async (req, res) => {
  try{
    const user = normUser(req.query.user);
    const maxPages = Math.max(1, Math.min(300, +(req.query.maxPages||200)));
    if(!user) return res.status(400).json({ error:"bad user" });

    const all = [];
    for(let p=1; p<=maxPages; p++){
      const r = await fetchDiaryPage(user, p);
      if(!r.ok) break;
      const items = parseDiaryPage(r.html);
      if(items.length===0) break;
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
