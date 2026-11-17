// Renders the project cards from projects.json.
// To add a project, edit projects.json only. Nothing here needs to change.
(() => {
  const ORG = "KasunRocz-Softwares";
  const grid = document.getElementById("grid");
  const filtersEl = document.getElementById("filters");
  const moreEl = document.getElementById("more");
  const moreList = document.getElementById("more-list");
  document.getElementById("year").textContent = new Date().getFullYear();

  const icons = {
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    gh: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>'
  };

  // Small DOM helper; uses textContent so nothing from JSON or the API is parsed as HTML.
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v; // only used for our own icon strings
      else n.setAttribute(k, v);
    }
    for (const kid of kids) if (kid) n.append(kid);
    return n;
  }

  function button(href, label, icon, primary) {
    if (!href) return null;
    const a = el("a", { class: "btn" + (primary ? " btn-primary" : ""), href, rel: "noopener" });
    a.innerHTML = icons[icon];
    a.append(document.createTextNode(label));
    return a;
  }

  // "Listed on" row: Product Hunt, AlternativeTo, etc. Shows the site's badge if given, else a text link.
  function listings(p) {
    const list = (p.listings || []).filter(l => l && l.url);
    if (!list.length) return null;
    const row = el("div", { class: "listings" }, el("span", { class: "listings-label", text: "Listed on" }));
    list.forEach(l => {
      const name = l.site || "Listing";
      const a = el("a", { class: "listing", href: l.url, rel: "noopener", target: "_blank", title: `${p.name} on ${name}` });
      if (l.badge) {
        const img = el("img", { src: l.badge, alt: `${p.name} on ${name}`, height: 40, loading: "lazy", decoding: "async" });
        img.addEventListener("error", () => { img.remove(); a.classList.add("text"); a.textContent = name; });
        a.append(img);
      } else {
        a.classList.add("text");
        a.textContent = name;
      }
      row.append(a);
    });
    return row;
  }

  function card(p, i) {
    const shot = el("a", { class: "shot" + (p.image ? "" : " noimg"), href: p.website || `https://github.com/${p.repo}`, "aria-label": `${p.name} website`, tabindex: "-1" });
    const version = el("span", { class: "version" });
    shot.append(version);
    if (p.image) {
      const img = el("img", { src: p.image, alt: `${p.name} screenshot`, loading: i < 2 ? "eager" : "lazy", decoding: "async" });
      img.addEventListener("error", () => { img.remove(); shot.classList.add("noimg"); shot.append(el("span", { text: p.name[0] })); });
      shot.append(img);
    } else {
      shot.append(el("span", { text: p.name[0] }));
    }

    const titleRow = el("div", { class: "title-row" },
      p.icon ? el("img", { class: "icon", src: p.icon, alt: "", width: 42, height: 42 }) : null,
      el("div", {}, el("h3", { text: p.name }), p.category ? el("div", { class: "cat", text: p.category }) : null)
    );

    const meta = el("div", { class: "meta" });
    (p.platforms || []).forEach(t => meta.append(el("span", { class: "tag", text: t })));
    if (p.license) meta.append(el("span", { class: "tag", text: p.license }));
    const stars = el("span", { class: "tag star", hidden: "" });
    meta.append(stars);

    const actions = el("div", { class: "actions" },
      button(p.download, p.downloadLabel || "Download", "down", true),
      button(p.website, "Website", "web"),
      button(p.repo ? `https://github.com/${p.repo}` : null, "Source", "gh")
    );

    const body = el("div", { class: "body" },
      titleRow,
      p.tagline ? el("p", { class: "tagline", text: p.tagline }) : null,
      p.description ? el("p", { class: "desc", text: p.description }) : null,
      meta, actions, listings(p)
    );

    const c = el("article", { class: "card", "data-platforms": (p.platforms || []).join("|") }, shot, body);
    c.style.setProperty("--accent", p.accent || "#27c1d3");
    c.style.animationDelay = `${i * 80}ms`;

    if (p.repo) liveStats(p.repo, version, stars);
    return c;
  }

  // Live version + stars from GitHub. Cached for an hour so visitors don't hit the rate limit.
  async function gh(path) {
    const key = "gh:" + path;
    try {
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < 3600e3) return hit.d;
    } catch {}
    const r = await fetch("https://api.github.com/" + path, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch {}
    return d;
  }

  async function liveStats(repo, versionEl, starsEl) {
    try {
      const rel = await gh(`repos/${repo}/releases/latest`);
      if (rel && rel.tag_name) versionEl.textContent = rel.tag_name.startsWith("v") ? rel.tag_name : "v" + rel.tag_name;
    } catch {}
    try {
      const info = await gh(`repos/${repo}`);
      if (info && info.stargazers_count > 0) { starsEl.textContent = info.stargazers_count; starsEl.hidden = false; }
    } catch {}
  }

  function buildFilters(projects) {
    const all = [...new Set(projects.flatMap(p => p.platforms || []))].sort();
    if (all.length < 2) return;
    const chips = ["All", ...all].map(name => {
      const b = el("button", { class: "chip", type: "button", "aria-pressed": name === "All" ? "true" : "false", text: name });
      b.addEventListener("click", () => {
        chips.forEach(c => c.setAttribute("aria-pressed", String(c === b)));
        grid.querySelectorAll(".card").forEach(c => {
          c.hidden = name !== "All" && !c.dataset.platforms.split("|").includes(name);
        });
      });
      return b;
    });
    filtersEl.append(...chips);
  }

  // Any other public org repo with GitHub Pages turned on, that isn't in projects.json yet,
  // shows up under "Also from the workshop" automatically.
  async function discover(known) {
    try {
      const repos = await gh(`orgs/${ORG}/repos?per_page=100&type=public`);
      const self = `${ORG}.github.io`.toLowerCase();
      const extra = repos.filter(r =>
        r.has_pages && !r.fork && !r.archived &&
        r.name.toLowerCase() !== self &&
        !known.has(r.name.toLowerCase())
      );
      if (!extra.length) return;
      extra.forEach(r => moreList.append(
        el("a", { class: "mini", href: r.homepage || `https://${ORG.toLowerCase()}.github.io/${r.name}/`, rel: "noopener" },
          el("b", { text: r.name }),
          el("span", { text: r.description || "Project site" }))
      ));
      moreEl.hidden = false;
    } catch {}
  }

  fetch("projects.json", { cache: "no-cache" })
    .then(r => r.json())
    .then(({ projects = [] }) => {
      grid.replaceChildren(...projects.map(card));
      if (!projects.length) grid.append(el("p", { class: "empty", text: "Projects are on the way." }));
      document.getElementById("stat-count").textContent = projects.length;
      buildFilters(projects);
      const known = new Set(projects.flatMap(p => [p.id, p.repo && p.repo.split("/")[1]]).filter(Boolean).map(s => s.toLowerCase()));
      discover(known);
    })
    .catch(() => {
      grid.replaceChildren(el("p", { class: "empty", text: "Couldn't load the project list. See all projects on GitHub." }));
    });
})();
