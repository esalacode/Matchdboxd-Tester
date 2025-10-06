// /api/avatar.js
// Returns { avatar: "<absolute URL>" } for a Letterboxd user.
const cheerio = require("cheerio");

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
];
const pickUA = () => UA_LIST[Math.floor(Math.random()*UA_LIST.length)];
const BLOCK_RE = /(Just a moment|Attention Required|cloudflare|Please enable cookies|Checking your browser)/i;

function norm(u){
  if(!u) return null;
  u = String(u).trim().replace(/^@/,"").toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(u) ? u : null;
}

module.exports = async (req, res) => {
  try{
    const u = norm((req.query.user||""));
    if(!u){ res.status(400).json({error:"bad user"}); return; }

    const url = `https://letterboxd.com/${u}/`;
    const r = await fetch(url, {
      headers: {
        "user-agent": pickUA(),
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.8",
        "cache-control": "no-cache"
      }
    });
    const html = await r.text();
    if(!r.ok || BLOCK_RE.test(html)){ res.status(502).json({error:"blocked"}); return; }

    const $ = cheerio.load(html);
    let src =
      $("#avatar-large").attr("src") ||
      $("img.avatar").attr("src")     ||
      $('meta[property="og:image"]').attr("content") || "";
    if(src && src.startsWith("//")) src = "https:" + src;

    res.setHeader("cache-control","public,max-age=86400,stale-while-revalidate=86400");
    res.json({ avatar: src || null });
  }catch(e){
    res.status(500).json({error:String(e && e.message || e)});
  }
};
