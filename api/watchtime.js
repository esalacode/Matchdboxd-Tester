// /api/watchtime.js
// Usage: /api/watchtime?user=<username>&maxPages=200
// Sums minutes for each diary log by scraping film runtimes.
// Node 18+. Install: npm i cheerio
const cheerio = require("cheerio");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15";
const BLOCK_RE = /(Just a moment|Attention Required|cloudflare|Please enable cookies|Checking your browser)/i;
const SEL_DIARY =
  "tr.diary-entry-row a[href*='/film/'], li.diary-entry a[href*='/film/'], article.diary-entry a[href*='/film/']";
const COOKIE = process.env.LB_COOKIE || "";
const MAX_PAGES = 200;

function normUser(u){ if(!u) return null; u=String(u).trim().replace(/^@/,"").toLowerCase(); return /^[a-z0-9_-]{1,30}$/i.test(u)?u:null; }
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function getHTML(url, retries=3){
  for(let i=0;i<retries;i++){
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept-language":"en-US,en;q=0.9", "cookie": COOKIE }
    });
    const html = await res.text();
    if (BLOCK_RE.test(html)) { await sleep(1500); continue; }
    return html;
  }
  throw new Error("Blocked or unreachable: " + url);
}

function nextPageURL(html){
  const $ = cheerio.load(html);
  const $a = $("a.next, a.next.page");
  if(!$a.length) return null;
  const href = $a.attr("href")||"";
  return href ? new URL(href, "https://letterboxd.com").href : null;
}

async function collectDiaryFilmHrefs(user, maxPages){
  let url = `https://letterboxd.com/${encodeURIComponent(user)}/films/diary/`;
  const hrefs = [];
  let pages = 0;
  while(url && pages < maxPages){
    pages++;
    const html = await getHTML(url, 3);
    const $ = cheerio.load(html);
    $(SEL_DIARY).each((_,a)=>{
      const h = ($(a).attr("href")||"").trim();
      if (h && /\/film\/[^/]+\/$/.test(h)) hrefs.push(new URL(h, "https://letterboxd.com").href);
    });
    url = nextPageURL(html);
    await sleep(250);
  }
  return hrefs;
}

async function getRuntimeMinutes(filmURL){
  // Accept either /film/slug/ or full URL
  const html = await getHTML(filmURL, 3);
  // Look for patterns like "123 mins"
  const m = html.match(/(\d{2,3})\s*mins?/i);
  if (m) return parseInt(m[1],10);
  // Fallback: look inside microdata
  const $ = cheerio.load(html);
  const rt = $("p.text-link, .text-footer, .releaseyear, .microdata").text() || $("body").text();
  const m2 = String(rt).match(/(\d{2,3})\s*mins?/i);
  if (m2) return parseInt(m2[1],10);
  return 0;
}

module.exports = async (req, res) => {
  try{
    const user = normUser(req.query.user);
    const maxPages = Math.min(parseInt(req.query.maxPages||MAX_PAGES,10)||MAX_PAGES, MAX_PAGES);
    if(!user) return res.status(400).json({error:"Bad user"});
    const hrefs = await collectDiaryFilmHrefs(user, maxPages);

    // Cache runtimes per film slug to avoid repeated fetch
    const cache = new Map();
    let totalMinutes = 0;

    for(const h of hrefs){
      const slug = (h.match(/\/film\/([^/]+)\//)||[])[1]||h;
      let mins = cache.get(slug);
      if (mins == null){
        mins = await getRuntimeMinutes(h);
        cache.set(slug, mins);
        await sleep(200);
      }
      totalMinutes += Math.max(0, mins||0);
    }

    res.setHeader("Cache-Control","public, max-age=1800");
    res.status(200).json({ user, logs: hrefs.length, minutes: totalMinutes, hours: +(totalMinutes/60).toFixed(2) });
  } catch(e){
    res.status(500).json({ error: e.message||String(e) });
  }
};
