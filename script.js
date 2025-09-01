// Minimal client-side scraper for Letterboxd /films/ using a CORS-friendly proxy.
// Notes:
// - Relies on the HTML containing `data-film-name` and `data-film-release-year` (or `data-film-year`) attributes.
// - Private profiles are inaccessible.
// - This is intentionally tiny and static: no build, no dependencies.

(function() {
  const $ = (sel) => document.querySelector(sel);

  const state = {
    results: [],
    startedAt: null,
    proxy: 'https://cors.isomorphic-git.org/',
    running: false,
  };

  function sanitizeUsername(raw) {
    if (!raw) return "";
    let s = raw.trim().toLowerCase();
    s = s.replace(/^@/, "");
    s = s.replace(/^https?:\/\/letterboxd\.com\//, "");
    s = s.replace(/\/+$/, "");
    // Allow letters, numbers, hyphen, underscore
    s = s.replace(/[^a-z0-9-_]/g, "");
    return s;
  }

  function setStatus(msg) { $("#status").textContent = msg || ""; }
  function setCount(n) { $("#count").textContent = `(${n})`; }
  function setElapsed() {
    if (!state.startedAt) return;
    const ms = Date.now() - state.startedAt;
    const s = (ms/1000).toFixed(1);
    $("#elapsed").textContent = `Fetched in ${s}s`;
  }

  function enableActions(enabled) {
    $("#run").disabled = !enabled;
    const hasResults = state.results.length > 0;
    $("#downloadCsv").disabled = !hasResults;
    $("#copy").disabled = !hasResults;
  }

  function parseFilmsFromHtml(html) {
    const films = [];
    // Quick gate to detect error pages
    if (/page you want|not found|doesn't exist|blocked|denied|verify you are human/i.test(html)) {
      return { films, hint: "Page not available or blocked" };
    }
    // Core regex to extract attributes from poster containers
    const re = /data-film-name="([^"]+)"[^>]*?(?:data-film-release-year|data-film-year)="(\d{4})"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      films.push({ title: decodeHtml(m[1]), year: m[2] });
    }
    return { films };
  }

  function decodeHtml(str) {
    // Minimal HTML entity decoding
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }

  async function fetchPage(username, page, proxyBase) {
    const target = `https://letterboxd.com/${username}/films/page/${page}/`;
    const url = proxyBase ? (proxyBase.replace(/\/+$/, "") + "/" + target) : target;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on page ${page}`);
    }
    const html = await res.text();
    return html;
  }

  async function run() {
    if (state.running) return;
    state.running = true;
    state.results = [];
    state.startedAt = Date.now();
    setElapsed();
    const timer = setInterval(setElapsed, 120);

    $("#resultsTable").style.display = "none";
    $("#results").innerHTML = "";
    $("#empty").style.display = "";
    setCount(0);
    enableActions(false);

    const username = sanitizeUsername($("#username").value);
    const proxyBase = ($("#proxy").value || state.proxy).trim();
    if (!username) {
      setStatus("Enter a username.");
      enableActions(true);
      state.running = false;
      clearInterval(timer);
      return;
    }
    setStatus("Fetching…");

    const seen = new Set();
    let page = 1;
    const MAX_PAGES = 500;
    try {
      for (; page <= MAX_PAGES; page++) {
        const html = await fetchPage(username, page, proxyBase);
        const { films, hint } = parseFilmsFromHtml(html);
        if (films.length === 0) {
          if (page === 1 && hint) {
            throw new Error(hint + " (is the profile private or username wrong?)");
          }
          // No more pages
          break;
        }
        let added = 0;
        for (const f of films) {
          const key = `${f.title}__${f.year}`;
          if (!seen.has(key)) {
            seen.add(key);
            state.results.push(f);
            added++;
          }
        }
        setStatus(`Fetched page ${page} — added ${added} films (total ${state.results.length})…`);
        setCount(state.results.length);
        await new Promise(r => setTimeout(r, 80)); // tiny politeness delay
      }

      // Sort by title ASC then year ASC
      state.results.sort((a,b) => a.title.localeCompare(b.title) || a.year.localeCompare(b.year));
      renderResults(state.results);
      setStatus(`Done. ${state.results.length} films found across ${page-1} page(s).`);
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err && err.message ? err.message : String(err)));
    } finally {
      enableActions(true);
      state.running = false;
      clearInterval(timer);
      setElapsed();
    }
  }

  function renderResults(items) {
    const tbody = $("#results");
    tbody.innerHTML = "";
    for (const row of items) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      const td2 = document.createElement("td");
      td1.textContent = row.title;
      td2.textContent = row.year;
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbody.appendChild(tr);
    }
    $("#empty").style.display = items.length ? "none" : "";
    $("#resultsTable").style.display = items.length ? "" : "none";
  }

  function makeCsv(items) {
    const header = "Title,Year\n";
    const lines = items.map(r => `"${r.title.replace(/"/g,'""')}",${r.year}`);
    return header + lines.join("\n");
  }

  function download(name, mime, content) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied CSV to clipboard.");
    } catch {
      setStatus("Clipboard copy failed (permissions).");
    }
  }

  // Wire up events
  $("#run").addEventListener("click", run);
  $("#username").addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
  $("#downloadCsv").addEventListener("click", () => {
    if (!state.results.length) return;
    const csv = makeCsv(state.results);
    download("letterboxd-films.csv", "text/csv;charset=utf-8", csv);
  });
  $("#copy").addEventListener("click", () => {
    if (!state.results.length) return;
    const csv = makeCsv(state.results);
    copyToClipboard(csv);
  });
  $("#testProxy").addEventListener("click", async () => {
    const proxyBase = ($("#proxy").value || state.proxy).trim();
    setStatus("Testing proxy…");
    try {
      const res = await fetch(proxyBase.replace(/\/+$/,"") + "/https://example.com/", { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("Proxy OK.");
    } catch (e) {
      setStatus("Proxy failed: " + (e && e.message ? e.message : String(e)));
    }
  });
})();