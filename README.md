# Minimal Letterboxd Username → Films Watched (Title + Year)

**What it does:** A pure static page that asks for a Letterboxd username, then fetches the public diary pages and extracts each film title and its release year. No server, no API keys.

**How it works:** The browser requests the user’s diary pages via a CORS-friendly mirror, e.g.
`https://r.jina.ai/http://letterboxd.com/<username>/films/diary/` (and `/page/2/`, …). It parses headings and the nearest 4‑digit year seen in the entry block.

**Limitations:** 
- Only works for **public** diary entries.
- Heuristics may miss edge cases; bump “Pages” to traverse more.
- If Letterboxd markup changes, the parser may need tweaks.

**Deploy:** Push these files to any static host (GitHub Pages, Netlify, Vercel static). Open `index.html`.

**Customization ideas (optional):**
- Add CSV export of `Title,Year`.
- Filter by year or dedupe rewatches.
- Style tweaks or add GitHub corner link.
