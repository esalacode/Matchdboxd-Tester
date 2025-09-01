# Minimal Letterboxd Film List Site (v2)

Static, client‑side site that lists **every** film a Letterboxd user has marked as *Watched* together with its release year.

## Changes in v2
* **Multiple CORS proxies**: Automatically falls back to _thingproxy.freeboard.io_, _AllOrigins_, then _cors.isomorphic-git.org_ to avoid the <kbd>Error: Load failed</kbd> issue.
* Slight pause between pages to stay within rate‑limits of free proxies.
* Broader selector (`li.poster-container, li.film-poster`) for future‑proofing.

## Usage
1. Upload the three files (`index.html`, `script.js`, `README.md`) to any static host (GitHub Pages, Netlify, etc.) or open `index.html` locally.
2. Enter a Letterboxd username and click **Fetch**.
3. Wait for the films to appear. Large collections may take 10–30 seconds.

**Requirements**
* The profile must be public.
* Browser with ES6 support (any modern browser).

----
MIT License.
