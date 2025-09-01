// Vercel Serverless Function (CommonJS): /api/ratings?user=<username>&maxPages=50
const cheerio = require("cheerio");

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
];
const pickUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normUser(u) {
  if (!u) return null;
  u = String(u).trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_-]{1,30}$/i.test(u) ? u : null;
}

function extractStarsText($tile) {
  const candidates = ["p.poster-viewingdata", "span[class*=rating]", ".rating"];
  for (const sel of candidates) {
    const t = $tile.find(sel).first().text().trim();
    if (/[★½]/.test(t)) {
      const m = t.match(/([★½]+)/);
      if (m) return m[1];
    }
  }
  const m = $tile.text().match(/([★½]+)/);
  return m ? m[1] : "";
}

function starsTextToFloat(s) {
  if (!s) return null;
  const stars = (s.match(/★/g) || []).length;
  const half = /½/.test(s) ? 0.5 : 0;
  const val = stars + half;
  return val > 0 ? val : null;
}

function parsePage(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("li").each((_, li) => {
    const $li = $(li);

    // ---- Title --------------------------------------------------------------
    const title =
      ($li.find("[data-film-name]").first().attr("data-film-name") ||
       $li.find("img[alt]").first().attr("alt") || "")
      .trim();
    if (!title) return;

    // ---- Slug ---------------------------------------------------------------
    let slug = null;

    // a) explicit data attribute
    slug = $li.find("[data-film-slug]").first().attr("data-film-slug") || slug;

    // b) anchor href
    if (!slug) {
      const href = $li.find('a[href*="/film/"]').first().attr("href") || "";
      const m = href.match(/\/film\/([^/]+)/);
      if (m) slug = m[1];
    }

    // c) other attributes some variants use
    if (!slug) {
      const dl =
        $li.find("[data-target-link*='/film/']").first().attr("data-target-link") ||
        $li.find("[data-film-link*='/film/']").first().attr("data-film-link") || "";
      const m = dl.match(/\/film\/([^/]+)/);
      if (m) slug = m[1];
    }

    // ---- Year ---------------------------------------------------------------
    let year = null;

    // from attributes
    const yAttr =
      $li.find("[data-film-year]").first().attr("data-film-year") ||
      $li.find("[data-film-release-year]").first().attr("data-film-release-year");
    if (yAttr && /^\d{4}$/.test(yAttr)) year = +yAttr;

    // from nearby text
    if (!year) {
      const ym = ($li.find(".year,.metadata,small").first().text() || "").match(/\b(19|20)\d{2}\b/);
      if (ym) year = +ym[0];
    }

    // from slug suffix e.g. "weapons-2025"
    if (!year && slug) {
      const ym = slug.match(/-(\d{4})$/);
      if (ym) year = +ym[1];
    }

    // ---- Rating -------------------------------------------------------------
    const starsText = extractStarsText($li);
    const rating = starsTextToFloat(starsText);
    if (rating === null) return;

    // ---- Canonical URL (not the per-user diary URL) -------------------------
    const url = slug ? `https://letterboxd.com/film/${slug}/` : null;

    items.push({ title, starsText, rating, slug, url, year });
  });

  return items;
}

async function fetchPage(user, pageNum) {
  const base = `https://letterboxd.com/${user}/films/ratings/`;
  const url = pageNum > 1 ? `${base}page/${pageNum}/` : base;
  const res = await fetch(url, {
    headers: {
      "User-Agent": pickUA(),
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });
  if (!res.ok) return { ok: false, status: res.status, url };
  const html = await res.text();
  return { ok: true, html, url };
}

module.exports = async function handler(req, res) {
  try {
    const user = normUser((req.query && req.query.user) || "");
    if (!user) {
      res.status(400).json({ error: "Provide ?user=<letterboxd username>" });
      return;
    }
    const maxPages = Math.min(+((req.query && req.query.maxPages) || 50), 200);

    const all = [];
    let page = 1;
    for (; page <= maxPages; page++) {
      const r = await fetchPage(user, page);
      if (!r.ok) {
        if (page === 1) {
          res.status(r.status).json({ error: `Fetch failed for ${r.url}`, status: r.status });
          return;
        }
        break;
      }
      const items = parsePage(r.html);
      if (items.length === 0) break;
      all.push(...items);
      await sleep(400);
    }

    // No de-duplication — keep multiple films with the same title
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ user, count: all.length, pagesScanned: page - 1, items: all });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
