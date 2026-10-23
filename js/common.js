/* Helpers shared by the customer menu (index.html) and the owner dashboard (admin.html). */
(function () {
  "use strict";

  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  /** Create a DOM element: h("div", {class:"x", onclick:fn}, "text", childEl) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v; // only ever used with static, trusted SVG strings
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  /** el.replaceChildren() that accepts arrays and skips null/false (the native one would print "null"). */
  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity)
      .filter((k) => k !== null && k !== undefined && k !== false)
      .map((k) => (k.nodeType ? k : document.createTextNode(String(k)))));
  }

  function money(n) {
    const v = Number(n);
    if (!isFinite(v)) return "";
    return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function isValidSlug(s) { return SLUG_RE.test(String(s || "")); }

  function uid(prefix) {
    return (prefix || "id") + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  /** Only allow images that live under assets/ (blocks ../ tricks and external tracking pixels). */
  function safeImagePath(p) {
    if (typeof p !== "string") return "";
    if (!/^assets\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(p)) return "";
    return p;
  }

  function isHex(c) { return /^#[0-9a-f]{6}$/i.test(c || ""); }

  /** Pick dark or light text for readability on top of the accent colour. */
  function inkFor(hex) {
    if (!isHex(hex)) return "#1a1405";
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.58 ? "#1a1405" : "#ffffff";
  }

  function applyTheme(data, root) {
    const el = root || document.documentElement;
    const theme = ["emerald", "midnight", "ivory"].includes(data.theme) ? data.theme : "emerald";
    el.setAttribute("data-theme", theme);
    const accent = isHex(data.accent) ? data.accent : "#c9a961";
    el.style.setProperty("--accent", accent);
    el.style.setProperty("--accent-ink", inkFor(accent));
  }

  function digits(s) { return String(s || "").replace(/\D+/g, ""); }

  function cleanData(d) {
    // Defensive normalisation so a bad JSON file never crashes the page.
    const out = Object.assign(
      { name: "", tagline: "", description: "", address: "", phone: "", hours: "", whatsapp: "",
        whatsappEnabled: false, logo: "", theme: "emerald", accent: "#c9a961", enabled: true,
        categories: [], items: [], updatedAt: "" },
      d || {}
    );
    out.categories = (Array.isArray(out.categories) ? out.categories : [])
      .filter((c) => c && c.id && c.name);
    out.items = (Array.isArray(out.items) ? out.items : []).filter((i) => i && i.id && i.name);
    return out;
  }

  window.QM = { h, fill, money, slugify, isValidSlug, uid, safeImagePath, isHex, inkFor, applyTheme, digits, cleanData };
})();
