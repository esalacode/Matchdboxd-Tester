# Minimal Letterboxd Film List Site

Static, client‑side site that lists **every** film a Letterboxd user has marked as *Watched* together with its release year.

## How it works
* Scrapes the public `/films` pages via the free **[AllOrigins](https://allorigins.win/)** CORS proxy—no backend needed.
* Parses each film’s `data-film-name` and `data-film-release-year` attributes.
* De‑duplicates by *title + year* so remakes with the same title remain distinct.

## Usage
1. Upload the three files (`index.html`, `script.js`, `README.md`) to any static host (GitHub Pages, Netlify, etc.) or open `index.html` locally.
2. Enter a Letterboxd username and click **Fetch**.
3. Wait for the films to appear. Large collections may take 10–30 seconds.

**Requirements**
* The profile must be public.
* Browser with ES6 support (any modern browser).

----
MIT License.
