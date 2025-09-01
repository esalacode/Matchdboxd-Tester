# Minimal Letterboxd → Films & Years (static)

A single‑file site. Enter a Letterboxd username → it outputs recent films they watched plus release year.

## How it works
- Fetches the user’s public RSS feed (`/{username}/rss/`; falls back to `/{username}/films/rss/`) and parses `letterboxd:filmTitle` and `letterboxd:filmYear` tags. If those tags are missing, it extracts `Title (YYYY)` from the item title.
- Fully client‑side; no build step or dependencies.
- If direct CORS to Letterboxd is blocked, it automatically retries via the public CORS proxy **api.allorigins.win**.

## Limitations
- Only public diaries are accessible.
- RSS feeds generally expose the most recent entries (≈50), not full history.
- Third‑party proxy reliability is not guaranteed; for production, add a tiny server or edge function to fetch RSS and set CORS headers.

## Deploy
- **GitHub Pages:** push this repo and enable Pages → serve `index.html`.
- **Vercel/Netlify:** drop the file into a new static project; no config needed.

## Local usage
Open `index.html` in a browser and type a username (no `@`, any `https://letterboxd.com/<user>` URL works too).

— generated for a minimal “just works” setup.
