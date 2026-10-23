/* Owner dashboard — edits a restaurant's menu as a draft in the browser, then publishes it
   (data/<slug>.json + images) to the GitHub repository that hosts the site. */
(function () {
  "use strict";
  const { h, fill, money, slugify, isValidSlug, uid, safeImagePath, isHex, digits, cleanData } = QM;
  const GH = window.QMGitHub;
  const $ = (id) => document.getElementById(id);

  const DEFAULT_CATS = ["Biriyani", "Meals", "Kerala Specials", "Porotta and Curry", "Shawarma", "Snacks", "Beverages", "Desserts"];
  const PRESET_TAGS = ["Spicy", "Popular", "Chef's Special", "New", "Bestseller"];
  const ACCENTS = [["#c9a961", "Gold"], ["#3fb97a", "Emerald"], ["#e0685a", "Ruby"], ["#f0a030", "Saffron"], ["#6aa7e0", "Sky"]];
  const THEMES = [["emerald", "Emerald & Gold"], ["midnight", "Midnight"], ["ivory", "Ivory"]];
  const VIEWS = [
    ["overview", "Overview", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"],
    ["profile", "Restaurant Profile", "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6"],
    ["menu", "Manage Menu", "M5 5h14M5 10h14M5 15h9M5 20h6"],
    ["categories", "Categories", "M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01"],
    ["qr", "QR Code", "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6h-3"],
    ["preview", "Public Preview", "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6"],
    ["publish", "Publish & Settings", "M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"],
  ];
  const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_UPLOAD = 10 * 1024 * 1024;

  /* ---------- storage ---------- */
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };
  const settings = Object.assign({ repo: "", branch: "main", siteUrl: "" }, lsGet("qm-settings", {}));
  const saveSettings = () => lsSet("qm-settings", settings);
  const getToken = () => { try { return sessionStorage.getItem("qm-token") || localStorage.getItem("qm-token") || ""; } catch (e) { return ""; } };
  const setToken = (t, remember) => {
    try { sessionStorage.removeItem("qm-token"); localStorage.removeItem("qm-token"); (remember ? localStorage : sessionStorage).setItem("qm-token", t); } catch (e) { /* ignore */ }
  };
  const forgetToken = () => { try { sessionStorage.removeItem("qm-token"); localStorage.removeItem("qm-token"); } catch (e) { /* ignore */ } };

  /* ---------- state ---------- */
  const S = { slug: "", data: null, images: {}, dirty: false, view: "overview", directory: [] };
  let quotaWarned = false;

  /* ---------- UI helpers ---------- */
  function toast(msg, type) {
    const t = h("div", { class: "toast " + (type === "err" ? "err" : "ok"), role: type === "err" ? "alert" : "status" }, msg);
    $("toasts").append(t);
    setTimeout(() => t.remove(), type === "err" ? 7000 : 3500);
  }

  const dlg = () => $("dlg");
  function openDlg(title, ...kids) {
    const d = dlg();
    d.setAttribute("aria-labelledby", "dlgTitle");
    d.replaceChildren(h("h2", { id: "dlgTitle" }, title), ...kids);
    if (!d.open) d.showModal();
  }
  const closeDlg = () => { if (dlg().open) dlg().close(); };

  function confirmDlg(title, text, okLabel) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (done) return; done = true; closeDlg(); resolve(v); };
      openDlg(title,
        h("p", { class: "hint" }, text),
        h("div", { class: "actions" },
          h("button", { class: "btn danger", type: "button", onclick: () => fin(true) }, okLabel || "Delete"),
          h("button", { class: "btn ghost", type: "button", onclick: () => fin(false) }, "Cancel")));
      dlg().addEventListener("close", () => fin(false), { once: true });
    });
  }

  function field(label, control, opts) {
    opts = opts || {};
    if (!control.id) control.id = uid("f");
    return h("div", { class: "field" },
      h("label", { for: control.id }, label, opts.req ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null),
      control,
      opts.hint ? h("small", {}, opts.hint) : null,
      h("small", { class: "err", role: "alert" }));
  }
  function fail(control, msg) {
    const box = control.closest(".field");
    if (box) { const e = box.querySelector("small.err"); if (e) e.textContent = msg; }
    control.focus();
    return false;
  }
  const clearErrors = (root) => root.querySelectorAll("small.err").forEach((e) => (e.textContent = ""));
  const input = (type, value, attrs) => h("input", Object.assign({ type, value: value == null ? "" : String(value) }, attrs || {}));
  function toggle(label, checked) {
    const i = h("input", { type: "checkbox", checked: !!checked });
    return { el: h("label", { class: "switch" }, i, h("span", { class: "track" }), h("span", {}, label)), input: i };
  }

  function download(blob, name) {
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- images ---------- */
  async function processImage(file, maxDim, asPng) {
    if (!OK_TYPES.includes(file.type)) throw new Error("Please choose a JPG, PNG or WebP image.");
    if (file.size > MAX_UPLOAD) throw new Error("That image is larger than 10 MB. Please choose a smaller one.");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("This image couldn't be read.")); i.src = url;
      });
      const k = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), hh = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement("canvas"); c.width = w; c.height = hh;
      const ctx = c.getContext("2d");
      if (!asPng) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, hh); }
      ctx.drawImage(img, 0, 0, w, hh);
      return c.toDataURL(asPng ? "image/png" : "image/jpeg", 0.8);
    } finally { URL.revokeObjectURL(url); }
  }
  const imgSrc = (p) => S.images[p] || safeImagePath(p);
  const dropPending = (p) => { if (p && S.images[p]) delete S.images[p]; };
  const rand = () => Math.random().toString(36).slice(2, 6);

  /** Reusable picker: returns {el, get()} where get() => {path, dataUrl, removed}. */
  function imagePicker(currentPath, newPathFn, maxDim, asPng, emptyText) {
    const st = { path: currentPath || "", dataUrl: "", removed: false, newPath: "" };
    const pv = h("div", { class: "pv" });
    const msg = h("small", { class: "err", role: "alert" });
    const paint = () => {
      const src = st.removed ? "" : st.dataUrl || (st.path ? imgSrc(st.path) : "");
      pv.replaceChildren(src ? h("img", { src, alt: "Preview" }) : emptyText);
    };
    const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr-only", id: uid("file") });
    file.addEventListener("change", async () => {
      msg.textContent = "";
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        st.dataUrl = await processImage(f, maxDim, asPng);
        st.newPath = newPathFn(); st.removed = false; paint();
      } catch (e) { msg.textContent = e.message; }
      file.value = "";
    });
    const el = h("div", { class: "field" },
      h("span", { class: "lab" }, "Image"),
      h("div", { class: "imgpick" }, pv,
        h("div", {},
          h("label", { class: "btn ghost sm", for: file.id }, st.path ? "Replace image" : "Choose image"),
          file,
          h("button", { class: "btn ghost sm", type: "button", style: "margin-left:8px", onclick: () => { st.removed = true; st.dataUrl = ""; paint(); } }, "Remove"),
          h("br"), h("small", { class: "hint" }, "JPG, PNG or WebP · up to 10 MB · resized automatically"))),
      msg);
    paint();
    return { el, get: () => st };
  }
  /** Apply a picker result to the draft; returns the new path ("" if none). */
  function commitImage(st, oldPath) {
    if (st.removed) { dropPending(oldPath); return ""; }
    if (st.dataUrl) { dropPending(oldPath); S.images[st.newPath] = st.dataUrl; return st.newPath; }
    return oldPath || "";
  }

  /* ---------- draft persistence ---------- */
  function saveDraft() {
    const ok = lsSet("qm-draft-" + S.slug, { data: S.data, images: S.images });
    if (!ok && !quotaWarned) { quotaWarned = true; toast("Browser storage is full — publish soon so you don't lose your changes.", "err"); }
  }
  function markDirty() { S.dirty = true; saveDraft(); chrome(); syncPreview(); }
  function chrome() {
    $("dirtyPill").hidden = !S.dirty;
    $("rName").textContent = S.data ? S.data.name || S.slug : "—";
  }

  /* ---------- boot / chooser ---------- */
  async function fetchJSON(url) {
    const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  async function fetchDirectory() {
    try { const l = await fetchJSON("data/restaurants.json"); return Array.isArray(l) ? l.filter((r) => r && isValidSlug(r.slug)) : []; }
    catch (e) { return []; }
  }
  const draftSlugs = () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("qm-draft-")) out.push(k.slice(9)); } } catch (e) { /* ignore */ } return out; };

  function showChooser() {
    $("shell").hidden = true;
    const c = $("chooser"); c.hidden = false;
    const pub = S.directory.map((r) => r.slug);
    const drafts = draftSlugs().filter((s) => !pub.includes(s));
    const list = [...S.directory.map((r) => ({ slug: r.slug, name: r.name || r.slug, note: draftSlugs().includes(r.slug) ? "unpublished changes" : "published" })),
      ...drafts.map((s) => ({ slug: s, name: (lsGet("qm-draft-" + s, {}).data || {}).name || s, note: "draft — not published yet" }))];

    const name = input("text", "", { placeholder: "e.g. Hotel Malabar", maxlength: "60", autocomplete: "off" });
    const slug = input("text", "", { placeholder: "hotel-malabar", maxlength: "40", autocapitalize: "none", autocomplete: "off" });
    let slugTouched = false;
    slug.addEventListener("input", () => { slugTouched = true; });
    name.addEventListener("input", () => { if (!slugTouched) slug.value = slugify(name.value); });

    const form = h("form", { novalidate: true, onsubmit: (e) => {
      e.preventDefault(); clearErrors(form);
      const n = name.value.trim(), s = slug.value.trim().toLowerCase();
      if (n.length < 2) return fail(name, "Enter the restaurant name.");
      if (!isValidSlug(s)) return fail(slug, "Use 3–40 letters, numbers or dashes (no spaces).");
      if (pub.includes(s) || draftSlugs().includes(s)) return fail(slug, "That web address is already used. Pick another.");
      createRestaurant(n, s);
    } },
      field("Restaurant name", name, { req: true }),
      field("Menu address name", slug, { req: true, hint: "Becomes part of the QR link (…/?r=this-name). It can't be changed later." }),
      h("button", { class: "btn", type: "submit" }, "Create restaurant"));

    c.replaceChildren(
      h("div", { class: "card-box" },
        h("h2", {}, "Menu Studio"),
        h("p", { class: "hint" }, "Choose a restaurant to edit, or create a new one."),
        list.length ? h("div", { class: "rows" }, list.map((r) =>
          h("button", { class: "btn ghost", type: "button", style: "justify-content:space-between", onclick: () => openRestaurant(r.slug) },
            h("span", {}, r.name), h("small", {}, r.note)))) : h("p", { class: "hint" }, "No restaurants found yet — create your first one below.")),
      h("div", { class: "card-box" }, h("h2", {}, "New restaurant"), form));
  }

  async function boot() {
    if (location.protocol === "file:") $("fileWarn").hidden = false;
    $("dlg").addEventListener("click", (e) => { if (e.target === $("dlg")) closeDlg(); });
    buildNav();
    S.directory = await fetchDirectory();
    const last = lsGet("qm-last", "");
    if (last && (S.directory.some((r) => r.slug === last) || draftSlugs().includes(last))) openRestaurant(last);
    else showChooser();
  }

  function enter(slug) {
    S.slug = slug; lsSet("qm-last", slug);
    $("chooser").hidden = true; $("shell").hidden = false;
    chrome(); go(S.view || "overview");
  }

  async function openRestaurant(slug) {
    S.images = {};
    const draft = lsGet("qm-draft-" + slug, null);
    if (draft && draft.data) {
      S.data = cleanData(draft.data); S.images = draft.images || {}; S.dirty = true;
      S.data.slug = slug; enter(slug); toast("Restored your unpublished changes.");
      return;
    }
    try {
      S.data = cleanData(await fetchJSON("data/" + slug + ".json"));
      S.data.slug = slug; S.dirty = false; enter(slug);
    } catch (e) {
      toast("Couldn't load this restaurant's published menu. " + (e.status === 404 ? "The file wasn't found." : "Check your connection."), "err");
      showChooser();
    }
  }

  function createRestaurant(name, slug) {
    S.data = cleanData({ slug, name, theme: "emerald", accent: "#c9a961", enabled: true,
      categories: DEFAULT_CATS.map((n) => ({ id: uid("c"), name: n })), items: [] });
    S.images = {}; S.slug = slug; S.view = "profile";
    markDirty(); enter(slug);
    toast("Restaurant created. Fill in the profile, add items, then publish.");
  }

  /* ---------- navigation ---------- */
  function buildNav() {
    fill($("nav"), VIEWS.map(([key, label, path]) =>
      h("button", { type: "button", "data-view": key, onclick: () => { go(key); closeSide(); } },
        h("span", { html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>' }), label)));
    $("burger").addEventListener("click", () => ($("side").classList.contains("open") ? closeSide() : openSide()));
    $("switchBtn").addEventListener("click", async () => {
      if (S.dirty && !(await confirmDlg("Switch restaurant?", "Your unpublished changes stay saved as a draft on this device, so nothing is lost.", "Switch"))) return;
      closeSide(); S.data = null; S.directory = await fetchDirectory(); showChooser();
    });
  }
  function openSide() {
    $("side").classList.add("open"); $("burger").setAttribute("aria-expanded", "true");
    if (!$("scrim")) document.body.append(h("div", { class: "scrim", id: "scrim", onclick: closeSide }));
  }
  function closeSide() {
    $("side").classList.remove("open"); $("burger").setAttribute("aria-expanded", "false");
    const s = $("scrim"); if (s) s.remove();
  }

  function go(view) {
    S.view = view;
    document.querySelectorAll("#nav button").forEach((b) => (b.dataset.view === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $("title").textContent = (VIEWS.find((v) => v[0] === view) || VIEWS[0])[1];
    previewFrame = null;
    const fn = { overview: vOverview, profile: vProfile, menu: vMenu, categories: vCategories, qr: vQR, preview: vPreview, publish: vPublish }[view];
    $("view").replaceChildren(fn());
    window.scrollTo({ top: 0 }); $("view").focus({ preventScroll: true });
  }

  const catName = (id) => (S.data.categories.find((c) => c.id === id) || {}).name || "—";
  function publicUrl() {
    const base = (settings.siteUrl.trim() || location.origin + location.pathname.replace(/[^/]*$/, "")).replace(/\/?$/, "/");
    return base + "?r=" + S.slug;
  }
  const isLocalUrl = (u) => /^(file:|http:\/\/(localhost|127\.|192\.168\.|10\.))/i.test(u) || /^null/.test(u);

  /* ---------- Overview ---------- */
  function vOverview() {
    const d = S.data, total = d.items.length, sold = d.items.filter((i) => i.available === false).length;
    const published = S.directory.some((r) => r.slug === S.slug);
    const stat = (n, l) => h("div", { class: "stat" }, h("b", {}, n), h("span", {}, l));
    const done = (ok, text, view) => h("li", {}, ok ? "✅ " : "⬜ ", h("a", { href: "#", style: "color:inherit", onclick: (e) => { e.preventDefault(); go(view); } }, text));
    return h("div", {},
      h("div", { class: "stats" }, stat(total, "Total items"), stat(total - sold, "Available"), stat(sold, "Sold out"), stat(d.categories.length, "Categories")),
      h("div", { class: "card-box" },
        h("h2", {}, d.name || S.slug),
        h("p", { class: "hint" }, "Public menu: ", h("span", { class: "pill " + (d.enabled ? "ok" : "warn") }, d.enabled ? "Enabled" : "Disabled"),
          " ", h("span", { class: "pill " + (published ? "ok" : "warn") }, published ? "Published" : "Not published yet"),
          S.dirty ? [" ", h("span", { class: "pill warn" }, "Unpublished changes")] : null),
        h("ul", { class: "steps", style: "list-style:none;padding:0" },
          done(!!(d.name && d.address), "Fill in the restaurant profile", "profile"),
          done(d.categories.length > 0, "Set up categories", "categories"),
          done(total > 0, "Add your food items", "menu"),
          done(published && !S.dirty, "Publish to GitHub", "publish"),
          done(false, "Download & print the QR code", "qr")),
        h("div", { class: "actions" },
          h("button", { class: "btn", type: "button", onclick: () => go("menu") }, "Manage menu"),
          h("button", { class: "btn ghost", type: "button", onclick: () => go("preview") }, "Preview menu"),
          S.dirty ? h("button", { class: "btn ghost", type: "button", onclick: () => go("publish") }, "Publish changes") : null)));
  }

  /* ---------- Profile ---------- */
  function vProfile() {
    const d = S.data;
    const name = input("text", d.name, { maxlength: "60" });
    const tagline = input("text", d.tagline, { maxlength: "80" });
    const desc = h("textarea", { maxlength: "240" }, d.description);
    const address = h("textarea", { maxlength: "200", style: "min-height:72px" }, d.address);
    const phone = input("tel", d.phone, { maxlength: "20", inputmode: "tel" });
    const hours = h("textarea", { maxlength: "300", placeholder: "Mon–Sun: 11:00 AM – 11:00 PM" }, d.hours);
    const wa = input("tel", d.whatsapp, { maxlength: "20", inputmode: "tel", placeholder: "919876543210" });
    const waOn = toggle("Show WhatsApp order button", d.whatsappEnabled);
    const enabled = toggle("Public menu is visible to customers", d.enabled);
    const accent = input("color", isHex(d.accent) ? d.accent : "#c9a961");
    const logo = imagePicker(d.logo, () => "assets/" + S.slug + "/logo-" + rand() + ".png", 400, true, "No logo");
    let theme = d.theme;

    const themeBox = h("div", { class: "choices", role: "radiogroup", "aria-label": "Theme" }, THEMES.map(([k, l]) =>
      h("label", { class: "choice" }, h("input", { type: "radio", name: "theme", value: k, checked: theme === k, onchange: () => { theme = k; } }), h("span", {}, l))));
    const swatches = h("div", { class: "choices", style: "margin-top:8px" }, ACCENTS.map(([c, l]) =>
      h("button", { class: "btn ghost sm", type: "button", "aria-label": "Use " + l + " accent", onclick: () => { accent.value = c; } },
        h("span", { class: "swatch", style: "background:" + c }), l)));

    const form = h("form", { class: "card-box", novalidate: true, onsubmit: (e) => {
      e.preventDefault(); clearErrors(form);
      const n = name.value.trim();
      if (n.length < 2) return fail(name, "Restaurant name is required (at least 2 characters).");
      const ph = digits(phone.value);
      if (phone.value.trim() && (ph.length < 7 || ph.length > 15)) return fail(phone, "Enter a valid phone number.");
      let w = digits(wa.value);
      if (w.length === 10) w = "91" + w;
      if (waOn.input.checked && (w.length < 11 || w.length > 15)) return fail(wa, "Enter the WhatsApp number with country code, e.g. 919876543210.");
      Object.assign(d, {
        name: n, tagline: tagline.value.trim(), description: desc.value.trim(), address: address.value.trim(),
        phone: phone.value.trim(), hours: hours.value.trim(), whatsapp: w, whatsappEnabled: waOn.input.checked,
        enabled: enabled.input.checked, theme, accent: accent.value,
      });
      d.logo = commitImage(logo.get(), d.logo);
      markDirty(); toast("Profile saved (not published yet).");
      go("profile");
    } },
      h("h2", {}, "Restaurant details"),
      h("p", { class: "hint" }, "Menu link: ", h("code", {}, "?r=" + S.slug)),
      logo.el,
      h("div", { class: "two" }, field("Restaurant name", name, { req: true }), field("Tagline", tagline)),
      field("Short description", desc, { hint: "Up to 240 characters." }),
      h("div", { class: "two" }, field("Address", address), field("Contact number", phone)),
      field("Opening hours", hours, { hint: "One line per day or range." }),
      h("div", { class: "two" }, field("WhatsApp number", wa, { hint: "Include country code. 10-digit Indian numbers get 91 added." }), h("div", { class: "field" }, h("span", { class: "lab" }, "Ordering"), waOn.el)),
      h("div", { class: "field" }, h("span", { class: "lab" }, "Theme"), themeBox),
      h("div", { class: "field" }, h("span", { class: "lab" }, "Accent colour"), h("div", {}, accent), swatches),
      enabled.el,
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "submit" }, "Save profile"),
        h("button", { class: "btn ghost", type: "button", onclick: () => go("preview") }, "Preview")));
    return form;
  }

  /* ---------- Menu ---------- */
  function vMenu() {
    const flt = { q: "", cat: "" };
    const q = input("search", "", { placeholder: "Search items…", "aria-label": "Search items" });
    const sel = h("select", { "aria-label": "Filter by category" }, h("option", { value: "" }, "All categories"), S.data.categories.map((c) => h("option", { value: c.id }, c.name)));
    const rows = h("div", { class: "rows" });
    const paint = () => {
      const t = flt.q.trim().toLowerCase();
      const items = S.data.items.filter((i) => (!flt.cat || i.category === flt.cat) && (!t || (i.name + " " + (i.description || "")).toLowerCase().includes(t)));
      if (!S.data.items.length) rows.replaceChildren(h("div", { class: "empty" }, h("h3", {}, "No items yet"), h("p", {}, "Add your first dish to get started."),
        h("button", { class: "btn", type: "button", onclick: () => editItem(null, paint) }, "Add item")));
      else if (!items.length) rows.replaceChildren(h("div", { class: "empty" }, h("h3", {}, "No matches"), h("p", {}, "Try another search or category.")));
      else fill(rows, items.map((i) => itemRow(i, paint)));
    };
    q.addEventListener("input", () => { flt.q = q.value; paint(); });
    sel.addEventListener("change", () => { flt.cat = sel.value; paint(); });
    paint();
    return h("div", {},
      h("div", { class: "toolbar" }, q, sel, h("button", { class: "btn", type: "button", onclick: () => editItem(null, paint) }, "+ Add item")),
      rows);
  }

  function itemRow(i, repaint) {
    const sw = toggle(i.available === false ? "Sold out" : "Available", i.available !== false);
    sw.input.addEventListener("change", () => {
      i.available = sw.input.checked; markDirty();
      toast(i.name + (i.available ? " is available." : " marked sold out."));
      repaint();
    });
    const src = imgSrc(i.image);
    const offer = Number(i.offerPrice) > 0 && Number(i.offerPrice) < Number(i.price);
    return h("div", { class: "irow" },
      h("div", { class: "th" }, src ? h("img", { src, alt: "", loading: "lazy" }) : "No photo"),
      h("div", { class: "meta" },
        h("strong", {}, h("span", { class: "vdot " + (i.veg ? "v" : "n"), role: "img", "aria-label": i.veg ? "Vegetarian" : "Non-vegetarian" }), i.name),
        h("small", {}, catName(i.category), " · ", offer ? [money(i.offerPrice), " (was ", money(i.price), ")"] : money(i.price)),
        (i.tags && i.tags.length) ? h("small", {}, i.tags.join(" · ")) : null),
      h("div", { class: "ctl" }, sw.el,
        h("div", { class: "actions", style: "margin:0" },
          h("button", { class: "btn ghost sm", type: "button", onclick: () => editItem(i, repaint) }, "Edit"),
          h("button", { class: "btn danger sm", type: "button", onclick: async () => {
            if (!(await confirmDlg("Delete this item?", "“" + i.name + "” will be permanently removed from your menu once you publish. This can't be undone.", "Delete item"))) return;
            dropPending(i.image); S.data.items = S.data.items.filter((x) => x.id !== i.id);
            markDirty(); toast("Item deleted."); repaint();
          } }, "Delete"))));
  }

  function editItem(item, repaint) {
    if (!S.data.categories.length) { toast("Add a category first (Categories page).", "err"); go("categories"); return; }
    const isNew = !item;
    const it = item || { id: uid("i"), name: "", description: "", price: "", offerPrice: "", category: S.data.categories[0].id, veg: true, tags: [], available: true, image: "" };

    const name = input("text", it.name, { maxlength: "80" });
    const cat = h("select", {}, S.data.categories.map((c) => h("option", { value: c.id, selected: c.id === it.category }, c.name)));
    const desc = h("textarea", { maxlength: "300" }, it.description);
    const price = input("number", it.price, { step: "0.01", min: "0", inputmode: "decimal", placeholder: "150" });
    const offer = input("number", it.offerPrice || "", { step: "0.01", min: "0", inputmode: "decimal", placeholder: "Optional" });
    let veg = it.veg !== false;
    const vegBox = h("div", { class: "choices", role: "radiogroup", "aria-label": "Diet type" },
      h("label", { class: "choice" }, h("input", { type: "radio", name: "veg", checked: veg, onchange: () => { veg = true; } }), h("span", {}, h("i", { class: "vdot v" }), "Vegetarian")),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "veg", checked: !veg, onchange: () => { veg = false; } }), h("span", {}, h("i", { class: "vdot n" }), "Non-vegetarian")));
    const presetBoxes = PRESET_TAGS.map((t) => ({ t, i: h("input", { type: "checkbox", checked: (it.tags || []).includes(t) }) }));
    const custom = input("text", (it.tags || []).filter((t) => !PRESET_TAGS.includes(t)).join(", "), { placeholder: "e.g. Gluten free", maxlength: "60" });
    const avail = toggle("Available (turn off to show “Sold out”)", it.available !== false);
    const pic = imagePicker(it.image, () => "assets/" + S.slug + "/" + it.id + "-" + rand() + ".jpg", 900, false, "No photo");

    const form = h("form", { novalidate: true, onsubmit: (e) => {
      e.preventDefault(); clearErrors(form);
      const n = name.value.trim();
      if (n.length < 2) return fail(name, "Enter the food name.");
      const p = Number(price.value);
      if (price.value.trim() === "" || !isFinite(p) || p <= 0 || p > 100000) return fail(price, "Enter a price between ₹1 and ₹1,00,000.");
      let o = 0;
      if (offer.value.trim() !== "") { o = Number(offer.value); if (!isFinite(o) || o <= 0 || o >= p) return fail(offer, "Offer price must be above 0 and lower than the normal price."); }
      const tags = [...presetBoxes.filter((x) => x.i.checked).map((x) => x.t),
        ...custom.value.split(",").map((s) => s.trim().slice(0, 20)).filter(Boolean)]
        .filter((t, idx, a) => a.findIndex((z) => z.toLowerCase() === t.toLowerCase()) === idx).slice(0, 6);
      const out = { id: it.id, name: n, description: desc.value.trim(), price: Math.round(p * 100) / 100,
        offerPrice: o ? Math.round(o * 100) / 100 : 0, category: cat.value, veg, tags, available: avail.input.checked, image: "" };
      out.image = commitImage(pic.get(), it.image);
      if (isNew) S.data.items.push(out); else Object.assign(it, out);
      markDirty(); closeDlg(); toast(isNew ? "Item added." : "Item updated."); repaint();
    } },
      field("Food name", name, { req: true }),
      h("div", { class: "two" }, field("Category", cat, { req: true }), field("Price (₹)", price, { req: true })),
      h("div", { class: "two" }, field("Offer price (₹)", offer, { hint: "Leave empty if there's no offer." }), h("div", { class: "field" }, h("span", { class: "lab" }, "Type"), vegBox)),
      field("Description", desc),
      h("div", { class: "field" }, h("span", { class: "lab" }, "Tags"),
        h("div", { class: "choices" }, presetBoxes.map((x) => h("label", { class: "choice" }, x.i, h("span", {}, x.t))))),
      field("Other tags (comma separated)", custom),
      pic.el, avail.el,
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "submit" }, isNew ? "Add item" : "Save changes"),
        h("button", { class: "btn ghost", type: "button", onclick: closeDlg }, "Cancel")));
    openDlg(isNew ? "Add item" : "Edit item", form);
    name.focus();
  }

  /* ---------- Categories ---------- */
  function vCategories() {
    const list = h("div", { class: "rows" });
    const newName = input("text", "", { placeholder: "New category, e.g. Seafood", maxlength: "40", "aria-label": "New category name" });
    const add = () => {
      const n = newName.value.trim();
      if (!n) return newName.focus();
      if (S.data.categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return toast("That category already exists.", "err");
      S.data.categories.push({ id: uid("c"), name: n }); newName.value = ""; markDirty(); toast("Category added."); paint();
    };
    const move = (idx, dir) => {
      const a = S.data.categories, j = idx + dir; if (j < 0 || j >= a.length) return;
      [a[idx], a[j]] = [a[j], a[idx]]; markDirty(); paint();
    };
    function paint() {
      const cats = S.data.categories;
      if (!cats.length) { list.replaceChildren(h("div", { class: "empty" }, h("h3", {}, "No categories"), h("p", {}, "Add a category above to organise your menu."))); return; }
      fill(list, cats.map((c, idx) => {
        const count = S.data.items.filter((i) => i.category === c.id).length;
        const nm = input("text", c.name, { maxlength: "40", "aria-label": "Category name" });
        nm.addEventListener("change", () => {
          const v = nm.value.trim();
          if (!v || cats.some((x) => x !== c && x.name.toLowerCase() === v.toLowerCase())) { nm.value = c.name; return toast("Enter a unique, non-empty name.", "err"); }
          c.name = v; markDirty(); toast("Category renamed.");
        });
        return h("div", { class: "crow" },
          h("div", {}, nm, h("small", { class: "hint" }, count + (count === 1 ? " item" : " items"))),
          h("div", { class: "ctl" },
            h("button", { class: "icon-btn", type: "button", "aria-label": "Move " + c.name + " up", disabled: idx === 0, onclick: () => move(idx, -1) }, "↑"),
            h("button", { class: "icon-btn", type: "button", "aria-label": "Move " + c.name + " down", disabled: idx === cats.length - 1, onclick: () => move(idx, 1) }, "↓"),
            h("button", { class: "btn danger sm", type: "button", onclick: async () => {
              const msg = count ? count + " item(s) use this category; they will appear under “More” until you give them a new category." : "This category will be removed.";
              if (!(await confirmDlg("Delete “" + c.name + "”?", msg, "Delete category"))) return;
              S.data.categories = S.data.categories.filter((x) => x !== c); markDirty(); toast("Category deleted."); paint();
            } }, "Delete")));
      }));
    }
    paint();
    return h("div", {},
      h("div", { class: "card-box" }, h("h2", {}, "Categories"), h("p", { class: "hint" }, "Rename, reorder with the arrows, add or delete. Customers see them in this order."),
        h("form", { class: "toolbar", style: "grid-template-columns:1fr auto", onsubmit: (e) => { e.preventDefault(); add(); } }, newName, h("button", { class: "btn", type: "submit" }, "Add"))),
      list);
  }

  /* ---------- QR ---------- */
  function loadImg(src) { return new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
  function qrFor(text) { const q = qrcode(0, "M"); q.addData(text); q.make(); return q; }
  function paintModules(ctx, q, x, y, size, color) {
    const n = q.getModuleCount(), cell = Math.floor(size / n), off = Math.floor((size - cell * n) / 2);
    ctx.fillStyle = color;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + off + c * cell, y + off + r * cell, cell, cell);
  }
  async function renderCard(canvas, url) {
    const W = 1000, H = 1320, ctx = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    try { await Promise.all([document.fonts.load('600 72px "Cormorant Garamond"'), document.fonts.load('500 32px "Poppins"')]); } catch (e) { /* fonts optional */ }
    ctx.fillStyle = "#faf6ec"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#c9a961"; ctx.lineWidth = 6; ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.lineWidth = 2; ctx.strokeRect(46, 46, W - 92, H - 92);
    const logo = await loadImg(imgSrc(S.data.logo));
    let y = 110;
    if (logo) {
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 175, 72, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logo, W / 2 - 72, 103, 144, 144); ctx.restore();
      ctx.beginPath(); ctx.arc(W / 2, 175, 72, 0, Math.PI * 2); ctx.strokeStyle = "#c9a961"; ctx.lineWidth = 4; ctx.stroke();
      y = 300;
    } else y = 200;
    ctx.fillStyle = "#0b2a17"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    let fs = 84; const title = S.data.name || S.slug;
    do { ctx.font = '600 ' + fs + 'px "Cormorant Garamond", Georgia, serif'; fs -= 4; } while (ctx.measureText(title).width > 820 && fs > 28);
    ctx.fillText(title, W / 2, y + 40);
    ctx.fillStyle = "#7a6a3a"; ctx.font = '500 34px Poppins, system-ui, sans-serif';
    ctx.fillText("Scan to view our menu", W / 2, y + 100);
    const bx = 110, by = y + 140, bs = 780;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by, bs, bs);
    ctx.strokeStyle = "#c9a961"; ctx.lineWidth = 3; ctx.strokeRect(bx, by, bs, bs);
    paintModules(ctx, qrFor(url), bx + 40, by + 40, bs - 80, "#06170d");
    ctx.fillStyle = "#555"; let us = 26;
    do { ctx.font = us + 'px Poppins, system-ui, sans-serif'; us -= 1; } while (ctx.measureText(url).width > 820 && us > 12);
    ctx.fillText(url, W / 2, by + bs + 70);
  }
  function plainQr(url) {
    const q = qrFor(url), c = document.createElement("canvas"), size = 1024, n = q.getModuleCount(), cell = Math.floor(size / (n + 8));
    c.width = c.height = cell * (n + 8);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    paintModules(ctx, q, cell * 4, cell * 4, cell * n, "#000");
    return c;
  }

  function vQR() {
    const url = publicUrl();
    const canvas = h("canvas", { role: "img", "aria-label": "QR code card for " + (S.data.name || S.slug), width: 1000, height: 1320 });
    const published = S.directory.some((r) => r.slug === S.slug);
    renderCard(canvas, url).catch((e) => toast("Couldn't draw the QR code: " + e.message, "err"));
    const blobOf = (c) => new Promise((res) => c.toBlob(res, "image/png"));
    return h("div", { class: "qrwrap" }, canvas,
      h("div", { class: "card-box" },
        h("h2", {}, "Your menu QR code"),
        h("p", { class: "hint" }, "This code never changes. When you publish menu updates, customers who scan it see the new menu."),
        h("div", { class: "urlbox" }, url),
        isLocalUrl(url) ? h("p", { class: "hint", style: "color:#f0b45a;margin-top:10px" }, "⚠ This link points to your own computer. Open the dashboard from your GitHub Pages address (or set the site address in Publish & Settings) before printing the QR.") : null,
        !published ? h("p", { class: "hint", style: "color:#f0b45a;margin-top:10px" }, "⚠ This restaurant hasn't been published yet, so the link won't work until you publish.") : null,
        h("div", { class: "actions" },
          h("button", { class: "btn", type: "button", onclick: async () => download(await blobOf(canvas), S.slug + "-menu-qr-card.png") }, "Download PNG"),
          h("button", { class: "btn ghost", type: "button", onclick: async () => download(await blobOf(plainQr(url)), S.slug + "-menu-qr.png") }, "QR only (PNG)"),
          h("button", { class: "btn ghost", type: "button", onclick: () => {
            $("printArea").replaceChildren(h("img", { src: canvas.toDataURL("image/png"), alt: "QR code for " + (S.data.name || S.slug) }));
            document.body.classList.add("printing");
            window.addEventListener("afterprint", () => document.body.classList.remove("printing"), { once: true });
            window.print();
          } }, "Print"),
          h("button", { class: "btn ghost", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(url); toast("Link copied."); } catch (e) { toast("Couldn't copy — select the link and copy it manually.", "err"); } } }, "Copy link"),
          h("a", { class: "btn ghost", href: url, target: "_blank", rel: "noopener" }, "Open menu"))));
  }

  /* ---------- Preview ---------- */
  let previewFrame = null;
  const previewOrigin = () => (location.origin === "null" ? "*" : location.origin);
  function syncPreview() {
    if (previewFrame && previewFrame.contentWindow) previewFrame.contentWindow.postMessage({ type: "qm-draft", data: S.data, images: S.images }, previewOrigin());
  }
  window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.type === "qm-ready") syncPreview(); });
  function vPreview() {
    previewFrame = h("iframe", { src: "index.html?preview=1", title: "Public menu preview", onload: syncPreview });
    return h("div", {},
      h("p", { class: "hint", style: "text-align:center" }, "This is exactly how customers will see your draft. Changes appear here instantly, before publishing."),
      h("div", { class: "phone" }, previewFrame));
  }

  /* ---------- Publish & settings ---------- */
  function referenced() {
    const s = new Set(); if (S.data.logo) s.add(S.data.logo); S.data.items.forEach((i) => i.image && s.add(i.image)); return s;
  }
  const pendingPaths = () => Object.keys(S.images).filter((p) => referenced().has(p));
  const dirEntry = () => ({ slug: S.slug, name: S.data.name, logo: S.data.logo || "" });
  const upsertDir = (list) => { const l = list.filter((r) => r && r.slug !== S.slug); l.push(dirEntry()); return l.sort((a, b) => String(a.name).localeCompare(String(b.name))); };
  const finalJson = (stamp) => JSON.stringify(Object.assign({}, S.data, { slug: S.slug, updatedAt: stamp }), null, 2);

  function vPublish() {
    const repo = input("text", settings.repo, { placeholder: "your-username/your-repository", autocapitalize: "none", autocomplete: "off" });
    const branch = input("text", settings.branch, { autocapitalize: "none" });
    const token = input("password", getToken(), { autocomplete: "off", placeholder: "github_pat_…" });
    const remember = toggle("Remember token on this device", !!(() => { try { return localStorage.getItem("qm-token"); } catch (e) { return ""; } })());
    const site = input("url", settings.siteUrl, { placeholder: "https://your-username.github.io/your-repository/", autocapitalize: "none" });
    const bar = h("i"), prog = h("div", { class: "progress", hidden: true }, bar), status = h("p", { class: "hint", role: "status" });
    const pubBtn = h("button", { class: "btn", type: "button" }, "Publish to GitHub");
    const pend = pendingPaths();

    const persist = () => { settings.repo = repo.value.trim(); settings.branch = branch.value.trim() || "main"; settings.siteUrl = site.value.trim(); saveSettings(); };
    [repo, branch, site].forEach((i) => i.addEventListener("change", persist));
    token.addEventListener("change", () => { const t = token.value.trim(); if (t) setToken(t, remember.input.checked); else forgetToken(); });
    remember.input.addEventListener("change", () => { const t = token.value.trim(); if (t) setToken(t, remember.input.checked); });

    const progress = (n, total, text) => { prog.hidden = false; bar.style.width = Math.round((n / total) * 100) + "%"; status.textContent = text; };

    pubBtn.addEventListener("click", async () => {
      persist(); const t = token.value.trim(); if (t) setToken(t, remember.input.checked);
      const r = settings.repo, b = settings.branch || "main";
      if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return fail(repo, "Enter it as owner/repository, e.g. aswin/menu-site.");
      if (!t) return fail(token, "Paste your GitHub token (see the steps below).");
      if (S.data.name.trim().length < 2) { toast("Add the restaurant name in the profile first.", "err"); return go("profile"); }
      pubBtn.disabled = true; clearErrors(pubBtn.closest("div.card-box") || document);
      try {
        progress(0, 10, "Checking GitHub access…");
        await GH.verify(t, r);
        const imgs = pendingPaths(), total = imgs.length + 3;
        let step = 0;
        for (const p of imgs) {
          progress(step++, total, "Uploading image " + step + " of " + imgs.length + "…");
          await GH.putFile(t, r, b, p, S.images[p].split(",")[1], "Menu Studio: add image for " + S.slug);
        }
        progress(step++, total, "Updating restaurant list…");
        const dirFile = await GH.getFile(t, r, b, "data/restaurants.json");
        let remote = []; try { if (dirFile && dirFile.content) remote = JSON.parse(GH.fromB64(dirFile.content)); } catch (e) { remote = []; }
        const list = upsertDir(Array.isArray(remote) ? remote : []);
        await GH.putFile(t, r, b, "data/restaurants.json", GH.b64Text(JSON.stringify(list, null, 2) + "\n"), "Menu Studio: update restaurant list");
        progress(step++, total, "Publishing menu…");
        const stamp = new Date().toISOString();
        await GH.putFile(t, r, b, "data/" + S.slug + ".json", GH.b64Text(finalJson(stamp) + "\n"), "Menu Studio: update menu for " + S.slug);
        progress(step++, total, "Cleaning up unused images…");
        const keep = referenced();
        const files = await GH.listDir(t, r, b, "assets/" + S.slug);
        for (const f of files) {
          if (f.type === "file" && !keep.has(f.path) && /^(logo|i[a-z0-9]{8,})(-[a-z0-9]+)?\.(jpg|png|webp)$/.test(f.name))
            await GH.deleteFile(t, r, b, f.path, f.sha, "Menu Studio: remove unused image");
        }
        progress(total, total, "Done.");
        S.images = {}; S.dirty = false; S.data.updatedAt = stamp; lsDel("qm-draft-" + S.slug); S.directory = list; chrome();
        toast("Published! GitHub Pages takes about 1–2 minutes to show the update.");
        $("view").replaceChildren(vPublish());
        $("view").prepend(h("div", { class: "card-box" }, h("h2", {}, "✅ Published"),
          h("p", { class: "hint" }, "Your menu is on its way. It can take 1–2 minutes for GitHub Pages to update. The QR code stays the same."),
          h("a", { class: "btn", href: publicUrl(), target: "_blank", rel: "noopener" }, "Open live menu")));
      } catch (e) {
        status.textContent = ""; prog.hidden = true;
        toast(e.message || "Publishing failed.", "err");
        status.textContent = "Not published: " + (e.message || "unknown error") + " Your changes are still saved as a draft here.";
        status.style.color = "var(--danger)";
      } finally { pubBtn.disabled = false; }
    });

    async function makeZip() {
      const stamp = new Date().toISOString(), enc = new TextEncoder();
      const files = [
        { path: "data/" + S.slug + ".json", data: enc.encode(finalJson(stamp) + "\n") },
        { path: "data/restaurants.json", data: enc.encode(JSON.stringify(upsertDir(S.directory), null, 2) + "\n") },
        ...pendingPaths().map((p) => { const bin = atob(S.images[p].split(",")[1]); return { path: p, data: Uint8Array.from(bin, (c) => c.charCodeAt(0)) }; }),
      ];
      download(QMZip.build(files), "menu-update-" + S.slug + ".zip");
      toast("ZIP downloaded. Unzip it and upload the data and assets folders to your repository.");
    }

    return h("div", {},
      h("div", { class: "card-box" },
        h("h2", {}, "Publish menu"),
        h("p", { class: "hint" }, S.dirty ? "You have unpublished changes" + (pend.length ? " (" + pend.length + " new image" + (pend.length > 1 ? "s" : "") + ")." : ".") : "Everything on this device is already published."),
        field("GitHub repository", repo, { hint: "The repository that hosts this site, as owner/name." }),
        h("div", { class: "two" }, field("Branch", branch), field("GitHub token", token, { hint: "Kept only in this browser. Never saved in the site files." })),
        remember.el, prog, status,
        h("div", { class: "actions" }, pubBtn,
          h("button", { class: "btn ghost", type: "button", onclick: makeZip }, "Download update ZIP"),
          h("button", { class: "btn ghost", type: "button", onclick: async () => {
            if (!(await confirmDlg("Discard draft?", "All unpublished changes on this device will be lost and the published menu will be reloaded.", "Discard"))) return;
            lsDel("qm-draft-" + S.slug); await openRestaurant(S.slug);
          } }, "Discard draft"))),
      h("div", { class: "card-box" },
        h("h2", {}, "How to get a GitHub token"),
        h("ol", { class: "steps" },
          h("li", {}, "On GitHub open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token."),
          h("li", {}, "Repository access: “Only select repositories” → choose this site's repository."),
          h("li", {}, "Permissions → Repository permissions → Contents: Read and write."),
          h("li", {}, "Generate, copy the token (starts with github_pat_) and paste it above. Anyone with this token can change your repository, so keep it private.")),
        h("p", { class: "hint" }, "No GitHub token? Use “Download update ZIP”, unzip it, then drag the data and assets folders into your repository on github.com (Add file → Upload files) and commit.")),
      h("div", { class: "card-box" },
        h("h2", {}, "Settings"),
        field("Public site address (for the QR code)", site, { hint: "Leave empty to use this page's own address. Example: https://your-username.github.io/your-repository/" }),
        h("div", { class: "actions" },
          h("button", { class: "btn ghost", type: "button", onclick: () => { forgetToken(); token.value = ""; toast("GitHub token removed from this browser."); } }, "Forget GitHub token"))));
  }

  boot();
})();
