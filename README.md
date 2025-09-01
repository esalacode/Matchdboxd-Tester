# Letterboxd → Films (Title + Year)

Minimal static site: enter a **Letterboxd username** and it lists every film they’ve logged, with the **release year**. No server, no build.

> ⚠️ **Public profiles only.** Letterboxd doesn’t offer a public API. This reads the public `/films/` pages in your browser via a CORS-friendly proxy.

## Files
- `index.html` – UI (single page)
- `script.js` – tiny scraper (client-side)
  
## How it works
- Fetches paginated pages at `https://letterboxd.com/<username>/films/page/<n>/` via a CORS proxy (default: `https://cors.isomorphic-git.org/`).
- Parses `data-film-name` and `data-film-release-year` (or `data-film-year`) attributes from poster elements.
- Deduplicates and sorts by title, then lets you **download CSV** or **copy** the list.

## Usage
1. Open `index.html` in any modern browser (double‑click is fine).
2. Enter a **Letterboxd username** (public) and press **Fetch films**.
3. Optional: if your network blocks cross‑origin requests, set a different **CORS proxy** in *Advanced*.

## Deploy
- Drop these files on any static host (GitHub Pages, Netlify, S3, etc.).
- No environment variables, no server.

## Notes & Limits
- If a profile is **private** or the username is wrong, the fetch will fail.
- Heavy users may have many pages; the script caps at 500 pages.
- This outputs **unique films** with release years — not individual diary entries.
- For complete diary entries (dates, rewatches), you’d need server-side scraping or Letterboxd’s export.

## License
MIT
