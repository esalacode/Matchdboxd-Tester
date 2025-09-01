// Letterboxd /films/ scraper (static). Adds proxy rotation + clearer errors.
(function () {
  const $ = (sel) => document.querySelector(sel);

  // Proxy rotation order. You can paste your own into the input to override.
  const PROXIES = [
    "https://cors.isomorphic-git.org/",
    "https://api.allorigins.win/raw?url=",
    "https://thingproxy.freeboard.io/fetch/"
  ];

  const state = {
    results: [],
    startedAt: null,
    running: false,
    proxyOverride: "", // if user types one
  };

  function sanitizeUsername(raw) {
    if (!raw) return "";
    let s = raw.trim().toLowerCase();
    s = s.replace(/^@/, "");
    s = s.replace(/^https?:\/\/letterboxd\.com\//, "");
    s = s.replace(/\/+$/, "");
    s = s.replace(/[^a-z0-9-_]/g, "");
    return s;
  }

  function setStatus(msg) { $("#status").textContent = msg || ""; }
  function setCount(n) { $("#count").textContent = `(${n})`; }
  function setElapsed() {
    if (!state.startedAt) return;
    const s = ((Date.now() - state.startedAt) / 1000).toFixed(1);
    $("#elapsed").textContent = `Fetched in ${s}s`;
  }
  function enableActions(enabled) {
    $("#run").disabled = !enabled;
    const has = state.results.length > 0;
    $("#downloadCsv").disabled = !has;
    $("#copy").disabled = !has;
  }

  function makeProxyUrl(proxyBase, target) {
    if (!proxyBase) return target;
    const b = proxyBase.replace(/\/+$/, "");
    if (/allorigins/i.test(b)) {
      const sepOk = b.endsWith("=") || /[?&]url=$/i.test(b);
      return b + (sepOk ? "" : "?url=") + encodeURIComponent(target);
    }
    if (/thingproxy/i.test(b)) {
      // ensure trailing /fetch/
      return (b.endsWith("/fetch") ? b + "/" : b + "/fetch/") + target;
    }
    // default: append as path
    return b + "/" + target;
  }

  function decodeHtml(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }

  function parseFilmsFromHtml(html) {
    const films = [];

    // Bail on common block/404 hints
    if (/page you want|not found|doesn't exist|blocked|denied|verify you are human/i.test(html)) {
      return { films, hint: "Page not available or blocked" };
    }

    // Primary: attributes on poster anchors
    let re = /data-film-name="([^"]+)"[^>]*?(?:data-film-release-year|data-film-year)="(\d{4})"/g;
    let m;
    while ((m = re.exec(html)) !== null) films.push({ title: decodeHtml(m[1]), year: m[2] });

    // Fallbacks if markup changes
    if (films.length === 0) {
      // tooltip titles like: data-original-title="Movie Name (2023)"
      re = /data-original-title="([^"(]+)\s*\((\d{4})\)"/g;
      while ((m = re.exec(html)) !== null) films.push({ title: decodeHtml(m[1]), year: m[2] });
    }
    if (films.length === 0) {
      // alt="Movie Name (2023)"
      re = /alt="([^"(]+)\s*\((\d{4})\)"/g;
      while ((m = re.exec(html)) !== null) films.push({ title: decodeHtml(m[1]), year: m[2] });
    }
    return { films };
  }

  async function fetchPage(username, page, proxyBase) {
    const target = `https://letterboxd.com/${username}/films/page/${page}/`;
    const url = makeProxyUrl(proxyBase, target);
    const res = await fetch(url, { credentials: "omit" }).catch((e) => {
      throw new Error(`Network error via proxy (${proxyBase || "none"}): ${e && e.message ? e.message : e}`);
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status} via proxy (${proxyBase || "none"}) on page ${page}`;
      if (res.status === 403) msg += " — blocked by target or proxy.";
      if (res.status === 404) msg += " — user or page not found.";
      throw new Error(msg);
    }
    return await res.text();
  }

  async function fetchAllPages(username, proxyBase) {
    const seen = new Set();
    const items = [];
    const MAX_PAGES = 500;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await fetchPage(username, page, proxyBase);
      const { films, hint } = parseFilmsFromHtml(html);
      if (films.length === 0) {
        if (page === 1 && hint) throw new Error(hint + " (is the profile private or username wrong?)");
        break;
      }
      let added = 0;
      for (const f of films) {
        const key = `${f.title}__${f.year}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push(f);
          added++;
        }
      }
      setStatus(`Proxy OK (${proxyBase || "none"}). Page ${page} — added ${added} (total ${items.length})…`);
      setCount(items.length);
      await new Promise(r => setTimeout(r, 80)); // tiny politeness delay
    }
    return items;
  }

  async function tryWithProxies(username) {
    const order = state.proxyOverride ? [state.proxyOverride] : PROXIES;
    let lastErr;
    for (const p of order) {
      try {
        return await fetchAllPages(username, p);
      } catch (e) {
        lastErr = e;
        console.warn("Proxy failed:", p, e);
        setStatus(`Proxy failed (${p}): ${(e && e.message) || e}. Trying next…`);
      }
    }
    throw lastErr || new Error("All proxies failed.");
  }

  function renderResults(items) {
    const tbody = $("#results");
    tbody.innerHTML = "";
    for (const row of items.sort((a,b)=> a.title.localeCompare(b.title) || a.year.localeCompare(b.year))) {
      const tr = document.createElement("tr");
      const t1 = document.createElement("td");
      const t2 = document.createElement("td");
      t1.textContent = row.title;
      t2.textContent = row.year;
      tr.appendChild(t1); tr.appendChild(t2);
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
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function run() {
    if (state.running) return;
    state.running = true;
    state.results = [];
    state.startedAt = Date.now();
    setElapsed();
    const timer = setInterval(setElapsed, 120);

    $("#results").innerHTML = "";
    $("#resultsTable").style.display = "none";
    $("#empty").style.display = "";
    setCount(0);
    enableActions(false);

    const username = sanitizeUsername($("#username").value);
    if (!username) {
      setStatus("Enter a username.");
      state.running = false; clearInterval(timer); enableActions(true);
      return;
    }
    state.proxyOverride = ($("#proxy").value || "").trim();
    setStatus("Fetching…");

    try {
      const items = await tryWithProxies(username);
      state.results = items;
      renderResults(items);
      setStatus(`Done. ${items.length} films found.`);
    } catch (e) {
      console.error(e);
      setStatus("Error: " + (e && e.message ? e.message : String(e)));
    } finally {
      enableActions(true);
      state.running = false;
      clearInterval(timer);
      setElapsed();
    }
  }

  async function testProxy() {
    const candidate = ($("#proxy").value || "").trim();
    const list = candidate ? [candidate] : PROXIES;
    setStatus("Testing proxy candidates…");
    for (const p of list) {
      try {
        const url = makeProxyUrl(p, "https://example.com/");
        const res = await fetch(url, { credentials: "omit" });
        if (res.ok) { setStatus(`Proxy OK: ${p}`); return; }
        else { setStatus(`Proxy responded ${res.status}: ${p}`); }
      } catch (e) {
        setStatus(`Proxy failed (${p}): ${(e && e.message) || e}`);
      }
    }
  }

  $("#run").addEventListener("click", run);
  $("#username").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  $("#downloadCsv").addEventListener("click", () => {
    if (!state.results.length) return;
    download("letterboxd-films.csv", "text/csv;charset=utf-8", makeCsv(state.results));
  });
  $("#copy").addEventListener("click", async () => {
    if (!state.results.length) return;
    try {
      await navigator.clipboard.writeText(makeCsv(state.results));
      setStatus("Copied CSV to clipboard.");
    } catch { setStatus("Clipboard copy failed (permissions)."); }
  });
  $("#testProxy").addEventListener("click", testProxy);
})();