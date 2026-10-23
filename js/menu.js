/* Customer-facing menu. Reads data/<slug>.json (published by the owner) and renders it. */
(function () {
  "use strict";
  const { h, fill, money, isValidSlug, safeImagePath, applyTheme, digits, cleanData } = QM;

  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const slug = (params.get("r") || "").trim().toLowerCase();
  const isPreview = params.get("preview") === "1";

  const state = { q: "", diet: "all", cat: "all", data: null, images: {}, raw: "" };

  const ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>',
    dish: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15h18M5 15a7 7 0 0 1 14 0M12 8V6m-3-1h6"/><path d="M4 19h16"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11 11 0 0 0 3.2 17.2L2 22l4.9-1.2A11 11 0 0 0 22 12a10.9 10.9 0 0 0-1.5-8.5ZM12 20a9 9 0 0 1-4.6-1.3l-.3-.2-2.9.7.8-2.8-.2-.3A9 9 0 1 1 12 20Zm5-6.7c-.3-.1-1.6-.8-1.9-.9s-.5-.1-.7.1-.8.9-.9 1.1-.3.2-.6.1a7.4 7.4 0 0 1-3.7-3.2c-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.8 3.8 0 0 0-1.2 2.8 6.6 6.6 0 0 0 1.4 3.5 15 15 0 0 0 5.7 5c2.1.9 2.9.8 3.4.7a2.9 2.9 0 0 0 1.9-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.4Z"/></svg>',
  };

  /* ---------- utilities ---------- */
  function imgSrc(path) {
    if (state.images[path]) return state.images[path]; // draft image from the dashboard preview
    return safeImagePath(path);
  }

  async function fetchJSON(url) {
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) { const e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
    return res.json();
  }

  function setMessage(title, text, actionLabel, action) {
    app.replaceChildren(
      h("div", { class: "state", role: "status" },
        h("h2", {}, title),
        h("p", {}, text),
        actionLabel ? h("button", { class: "btn", type: "button", onclick: action }, actionLabel) : null)
    );
  }

  function loading() {
    app.replaceChildren(
      h("div", { class: "wrap", style: "padding-top:40px" },
        h("div", { class: "spinner", role: "status", "aria-label": "Loading menu" }),
        h("div", { class: "skeleton" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton" }))
    );
  }

  /* ---------- rendering ---------- */
  function renderShell(d) {
    const wa = d.whatsappEnabled ? digits(d.whatsapp) : "";
    const logoSrc = imgSrc(d.logo);

    const logo = logoSrc
      ? h("img", { class: "logo", src: logoSrc, alt: d.name + " logo", width: 112, height: 112,
          onerror: (e) => e.target.replaceWith(h("div", { class: "logo logo-fallback", "aria-hidden": "true" }, (d.name || "?").charAt(0))) })
      : h("div", { class: "logo logo-fallback", "aria-hidden": "true" }, (d.name || "?").charAt(0));

    const info = [];
    if (d.address) info.push(h("li", {}, h("span", { html: ICON.pin }),
      h("a", { href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.address), target: "_blank", rel: "noopener" }, d.address)));
    if (d.hours) info.push(h("li", {}, h("span", { html: ICON.clock }),
      h("span", {}, d.hours.split("\n").filter(Boolean).map((l, i) => h("span", { style: "display:block" }, l)))));
    if (d.phone) info.push(h("li", {}, h("span", { html: ICON.phone }),
      h("a", { href: "tel:" + d.phone.replace(/[^\d+]/g, "") }, d.phone)));

    const hero = h("header", { class: "hero" },
      logo,
      h("h1", {}, d.name),
      d.tagline ? h("p", { class: "tagline" }, d.tagline) : null,
      d.description ? h("p", { class: "desc" }, d.description) : null,
      info.length ? h("ul", { class: "info" }, info) : null);

    const search = h("input", {
      type: "search", id: "q", placeholder: "Search dishes…", autocomplete: "off", enterkeyhint: "search",
      "aria-label": "Search dishes", value: state.q,
      oninput: (e) => { state.q = e.target.value; renderList(); },
    });
    const dietBtn = (key, label, dot) => h("button", {
      type: "button", "data-diet": key, "aria-pressed": String(state.diet === key), "aria-label": label,
      onclick: () => { state.diet = key; renderList(); },
    }, dot ? h("span", { class: "dot " + dot }) : null, key === "all" ? "All" : label);

    const controls = h("div", { class: "controls" },
      h("div", { class: "wrap" },
        h("div", { class: "row" },
          h("label", { class: "search" }, h("span", { class: "sr-only" }, "Search dishes"), h("span", { html: ICON.search }), search),
          h("div", { class: "seg", role: "group", "aria-label": "Diet filter" },
            dietBtn("all", "All"), dietBtn("veg", "Veg", "v"), dietBtn("nonveg", "Non-veg", "n"))),
        h("div", { class: "chips", id: "chips", role: "group", "aria-label": "Categories" })));

    const fab = wa
      ? h("a", { class: "wa", href: "https://wa.me/" + wa + "?text=" + encodeURIComponent("Hi " + d.name + ", I'd like to place an order."),
          target: "_blank", rel: "noopener" }, h("span", { html: ICON.wa }), "Order on WhatsApp")
      : null;

    fill(app,
      hero, controls,
      h("main", { class: "wrap", id: "list" }),
      h("p", { class: "credit" }, "Prices in ₹ · Menu may change without notice"),
      fab);
    renderList();
  }

  function visibleItems(d) {
    const q = state.q.trim().toLowerCase();
    const catName = (id) => (d.categories.find((c) => c.id === id) || {}).name || "";
    return d.items.filter((i) => {
      if (state.diet === "veg" && !i.veg) return false;
      if (state.diet === "nonveg" && i.veg) return false;
      if (state.cat !== "all" && i.category !== state.cat) return false;
      if (!q) return true;
      return [i.name, i.description, (i.tags || []).join(" "), catName(i.category)].join(" ").toLowerCase().includes(q);
    });
  }

  function card(i, d) {
    const price = Number(i.price), offer = Number(i.offerPrice);
    const hasOffer = offer > 0 && offer < price;
    const sold = i.available === false;
    const src = imgSrc(i.image);
    const wa = d.whatsappEnabled ? digits(d.whatsapp) : "";

    const thumb = h("div", { class: "thumb" },
      src ? h("img", { src, alt: i.name, loading: "lazy", decoding: "async", width: 112, height: 112,
              onerror: (e) => e.target.replaceWith(h("div", { class: "ph", html: ICON.dish })) })
          : h("div", { class: "ph", html: ICON.dish }),
      sold ? h("span", { class: "sold-badge" }, "SOLD OUT") : null);

    const foot = h("div", { class: "foot" },
      h("div", { class: "price" },
        h("span", { class: "now" }, money(hasOffer ? offer : price)),
        hasOffer ? h("span", { class: "was" }, money(price)) : null,
        hasOffer ? h("span", { class: "off" }, Math.round((1 - offer / price) * 100) + "% OFF") : null),
      sold ? h("span", { class: "sold-label" }, "Currently unavailable")
        : wa ? h("a", { class: "order", target: "_blank", rel: "noopener",
            href: "https://wa.me/" + wa + "?text=" + encodeURIComponent("Hi " + d.name + ", I'd like to order: " + i.name + " (" + money(hasOffer ? offer : price) + ")"),
            "aria-label": "Order " + i.name + " on WhatsApp" }, "Order")
        : null);

    return h("article", { class: "card" + (sold ? " sold" : "") },
      thumb,
      h("div", { class: "body" },
        h("div", { class: "name-row" },
          h("span", { class: "vm " + (i.veg ? "v" : "n"), role: "img", "aria-label": i.veg ? "Vegetarian" : "Non-vegetarian" }),
          h("h3", { class: "name" }, i.name)),
        i.description ? h("p", { class: "d" }, i.description) : null,
        (i.tags && i.tags.length) ? h("div", { class: "tags" }, i.tags.map((t) => h("span", { class: "tag" }, t))) : null,
        foot));
  }

  function renderList() {
    const d = state.data;
    if (!d) return;

    // keep segmented buttons in sync
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.diet === state.diet)));

    // category chips (only categories that actually contain items)
    const used = new Set(d.items.map((i) => i.category));
    const cats = d.categories.filter((c) => used.has(c.id));
    const chips = document.getElementById("chips");
    fill(chips,
      h("button", { class: "chip", type: "button", "aria-pressed": String(state.cat === "all"), onclick: () => { state.cat = "all"; renderList(); } }, "All"),
      cats.map((c) => h("button", { class: "chip", type: "button", "aria-pressed": String(state.cat === c.id),
        onclick: () => { state.cat = c.id; renderList(); window.scrollTo({ top: 0 }); } }, c.name)));

    const list = document.getElementById("list");
    if (!d.items.length) {
      list.replaceChildren(h("div", { class: "state" }, h("h2", {}, "Menu coming soon"), h("p", {}, "We're preparing our dishes. Please check back shortly.")));
      return;
    }
    const items = visibleItems(d);
    if (!items.length) {
      list.replaceChildren(h("div", { class: "state", role: "status" },
        h("h2", {}, "No dishes found"), h("p", {}, "Try a different search or filter."),
        h("button", { class: "btn", type: "button", onclick: () => { state.q = ""; state.diet = "all"; state.cat = "all"; const q = document.getElementById("q"); if (q) q.value = ""; renderList(); } }, "Clear filters")));
      return;
    }

    const sections = [];
    const known = new Set(d.categories.map((c) => c.id));
    d.categories.forEach((c) => {
      const its = items.filter((i) => i.category === c.id);
      if (its.length) sections.push({ id: c.id, name: c.name, items: its });
    });
    const other = items.filter((i) => !known.has(i.category));
    if (other.length) sections.push({ id: "other", name: "More", items: other });

    fill(list, sections.map((s) =>
      h("section", { class: "cat", "aria-labelledby": "c-" + s.id },
        h("h2", { id: "c-" + s.id }, s.name),
        h("div", { class: "grid" }, s.items.map((i) => card(i, d))))));
  }

  /* ---------- data flow ---------- */
  function show(raw) {
    const d = cleanData(raw);
    state.data = d;
    applyTheme(d);
    document.title = (d.name || "Menu") + " — Digital Menu";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#06170d");

    if (d.enabled === false && !isPreview) {
      setMessage(d.name || "Menu", "This menu is currently unavailable. Please ask the staff for a printed menu.");
      return;
    }
    renderShell(d);
  }

  async function loadRestaurant(quiet) {
    try {
      const raw = await fetchJSON("data/" + slug + ".json");
      const sig = JSON.stringify(raw);
      if (quiet && sig === state.raw) return; // nothing changed
      state.raw = sig;
      show(raw);
    } catch (err) {
      if (quiet) return; // keep showing the last good menu
      if (err.status === 404) setMessage("Menu not found", "We couldn't find this restaurant. Please re-scan the QR code or ask the staff.");
      else setMessage("Couldn't load the menu", "Check your internet connection and try again.", "Try again", () => { loading(); loadRestaurant(false); });
    }
  }

  async function loadDirectory() {
    try {
      const list = await fetchJSON("data/restaurants.json");
      const ok = (Array.isArray(list) ? list : []).filter((r) => r && isValidSlug(r.slug));
      if (!ok.length) return setMessage("No menus yet", "No restaurants have been published on this site.");
      app.replaceChildren(h("div", { class: "wrap" }, h("div", { class: "state" },
        h("h2", {}, "Choose a restaurant"),
        h("div", { class: "rlist" }, ok.map((r) => h("a", { href: "?r=" + r.slug },
          safeImagePath(r.logo) ? h("img", { src: r.logo, alt: "", width: 52, height: 52, loading: "lazy" }) : null,
          h("strong", {}, r.name || r.slug)))))));
    } catch (e) {
      setMessage("No menu selected", "Please scan a restaurant's QR code to open its menu.");
    }
  }

  function start() {
    if (isPreview) {
      document.getElementById("previewBanner").hidden = false;
      setMessage("Preview", "Waiting for the dashboard…");
      window.addEventListener("message", (e) => {
        if (e.origin !== location.origin || !e.data || e.data.type !== "qm-draft") return;
        state.images = e.data.images || {};
        show(e.data.data);
      });
      if (window.parent !== window) window.parent.postMessage({ type: "qm-ready" }, location.origin);
      return;
    }
    if (!slug) return loadDirectory();
    if (!isValidSlug(slug)) return setMessage("Menu not found", "This menu link looks invalid. Please re-scan the QR code.");
    loading();
    loadRestaurant(false);

    // "Live" updates: pick up newly published changes when the tab regains focus, and once a minute.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadRestaurant(true); });
    setInterval(() => { if (document.visibilityState === "visible") loadRestaurant(true); }, 60000);
  }

  start();
})();
