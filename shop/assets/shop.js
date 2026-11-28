/* Umoja Club Shop
   A thin storefront on top of Shopify. Shopify owns the catalog, prices,
   stock, cart, checkout, payments, orders, discounts, shipping and
   customer accounts. This file only reads that data and presents it.
   Settings live in shop-config.js. */
(function () {
  "use strict";
  var C = window.SHOP_CONFIG || {};
  /* CHECKOUT: real Shopify checkout is offered only when this is true.
     API: true once products and cart are coming live from Shopify's
     Storefront API. Until products are Active and published to the Headless
     channel, Shopify returns none and the shop falls back to the snapshot. */
  var CHECKOUT = C.checkoutEnabled === true;
  var API = false;
  var SOURCE_NOTE = "";
  var BAG_KEY = "umoja-shop-bag-v1";        /* preview bag (local only) */
  var CART_KEY = "umoja-shop-cart-id-v1";   /* live Shopify cart id */

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(a, cur) {
    var n = Number(a || 0);
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (e) { return "$" + n.toFixed(2); }
  }
  function img(url, w) {
    if (!url) return "";
    return url + (url.indexOf("?") > -1 ? "&" : "?") + "width=" + w;
  }
  function srcset(url) { return [400, 700, 1000, 1400].map(function (w) { return img(url, w) + " " + w + "w"; }).join(", "); }
  function toast(msg) {
    var t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function productUrl(h) { return "/shop/p/" + encodeURIComponent(h); }
  var SWATCH = { black: "#161514", "black with white": "linear-gradient(90deg,#161514 50%,#f4f2ec 50%)", white: "#f4f2ec", apricot: "#E9D9BF", cream: "#EDE3CF", gold: "#F5C205", yellow: "#F5C205", navy: "#1c2438", grey: "#9a9894", gray: "#9a9894" };

  /* ---------------- Shopify Storefront API ---------------- */
  function gql(query, variables) {
    var headers = { "Content-Type": "application/json", "Accept": "application/json" };
    if (C.storefrontToken) headers["X-Shopify-Storefront-Access-Token"] = C.storefrontToken;
    return fetch("https://" + C.storeDomain + "/api/" + C.apiVersion + "/graphql.json", {
      method: "POST", headers: headers, body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.errors && j.errors.length) throw new Error(j.errors[0].message);
      return j.data;
    });
  }
  var P_FIELDS = "id title handle descriptionHtml tags availableForSale " +
    "options { name optionValues { name } } " +
    "images(first: 12) { nodes { url altText width height } } " +
    "variants(first: 100) { nodes { id title availableForSale price { amount currencyCode } selectedOptions { name value } image { url } } }";

  function normProduct(p) {
    var opts = (p.options || []).map(function (o) {
      return { name: o.name, values: o.values || (o.optionValues || []).map(function (v) { return v.name; }) };
    });
    var images = p.images && p.images.nodes ? p.images.nodes : (p.images || []);
    var variants = p.variants && p.variants.nodes ? p.variants.nodes : (p.variants || []);
    var prices = variants.map(function (v) { return Number(v.price.amount); });
    return {
      id: p.id, title: p.title, handle: p.handle, descriptionHtml: p.descriptionHtml || "", tags: p.tags || [],
      options: opts, images: images,
      variants: variants.map(function (v) {
        var so = {}; (v.selectedOptions || []).forEach(function (o) { so[o.name] = o.value; });
        return { id: v.id, title: v.title, available: v.availableForSale !== false, price: Number(v.price.amount), currency: v.price.currencyCode, options: so, image: v.image ? v.image.url : null };
      }),
      minPrice: Math.min.apply(null, prices), maxPrice: Math.max.apply(null, prices),
      currency: (variants[0] && variants[0].price.currencyCode) || "USD"
    };
  }
  function visible(p) { return (p.tags || []).indexOf(C.hiddenTag) === -1; }

  var catalogPromise = null;
  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    function snapshot(reason) {
      API = false; SOURCE_NOTE = reason;
      return fetch("/shop/preview-catalog.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
        return shape(d.collections.map(function (c) { return { handle: c.handle, title: c.title, descriptionHtml: c.descriptionHtml, products: c.products.map(normProduct) }; }));
      });
    }
    if (C.dataSource === "snapshot" || !C.storeDomain) {
      catalogPromise = snapshot("snapshot");
    } else {
      catalogPromise = gql("query Shop { collections(first: 30) { nodes { handle title descriptionHtml products(first: 100) { nodes { " + P_FIELDS + " } } } } }")
        .then(function (d) {
          var cat = shape(d.collections.nodes.map(function (c) { return { handle: c.handle, title: c.title, descriptionHtml: c.descriptionHtml, products: c.products.nodes.map(normProduct) }; }));
          if (!cat.products.length) return snapshot("empty");
          API = true; SOURCE_NOTE = "live"; return cat;
        })
        .catch(function (err) { if (window.console) console.warn("Shopify Storefront API:", err); return snapshot("error"); });
    }
    catalogPromise.then(function () { document.dispatchEvent(new CustomEvent("shop:source")); });
    return catalogPromise;
  }
  /* Keep only collections with products we can show, in the configured order. */
  function shape(cols) {
    var order = C.collectionOrder || [];
    cols = cols.filter(function (c) {
      if (C.hiddenCollectionPrefix && c.handle.indexOf(C.hiddenCollectionPrefix) === 0) return false;
      if (c.handle === "frontpage" || c.handle === "all") return false;
      c.products = c.products.filter(visible);
      return c.products.length > 0;
    });
    cols.sort(function (a, b) {
      var ia = order.indexOf(a.handle), ib = order.indexOf(b.handle);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var all = [], seen = {};
    cols.forEach(function (c) { c.products.forEach(function (p) { if (!seen[p.handle]) { seen[p.handle] = 1; all.push(p); } }); });
    return { collections: cols, products: all };
  }
  function loadProduct(handle) {
    return loadCatalog().then(function (cat) {
      var found = cat.products.filter(function (p) { return p.handle === handle; })[0];
      if (found || !API) return { product: found || null, catalog: cat };
      return gql("query P($h: String!) { product(handle: $h) { " + P_FIELDS + " } }", { h: handle }).then(function (d) {
        var p = d.product ? normProduct(d.product) : null;
        return { product: p && visible(p) ? p : null, catalog: cat };
      });
    });
  }

  /* ---------------- description parsing ----------------
     Shopify descriptions are the source of truth. Supplier descriptions
     use <h3> headings (Features, Care Instructions, Fabric) and a size
     table with id="size-guide". We lift those into tidy sections. */
  function parseDescription(html) {
    var out = { intro: "", sections: [], size: null };
    var doc = new DOMParser().parseFromString("<div id='r'>" + (html || "") + "</div>", "text/html");
    var root = doc.getElementById("r");
    var cur = null, introParts = [];
    Array.prototype.slice.call(root.childNodes).forEach(function (n) {
      var tag = n.nodeName;
      if (tag === "TABLE") { out.size = parseSize(n); cur = null; return; }
      if (/^H[2-4]$/.test(tag)) { cur = { title: n.textContent.trim(), items: [] }; out.sections.push(cur); return; }
      if (cur) {
        var t = (n.textContent || "").trim().replace(/^[-•]\s*/, "");
        if (t) cur.items.push(t);
      } else {
        if (n.nodeType === 3) { if (n.textContent.trim()) introParts.push("<p>" + esc(n.textContent.trim()) + "</p>"); }
        else if (n.outerHTML) introParts.push(n.outerHTML);
      }
    });
    out.intro = introParts.join("");
    return out;
  }
  function parseSize(table) {
    var rows = $$("tr", table).map(function (tr) { return $$("td,th", tr).map(function (td) { return { t: td.textContent.trim(), span: +td.getAttribute("colspan") || 1 }; }); });
    if (rows.length < 3) return null;
    var sizes = rows[0].slice(1).map(function (c) { return c.t; });
    var units = rows[1].slice(1).map(function (c) { return c.t.toLowerCase(); });
    var per = units.length / Math.max(sizes.length, 1);
    var unitNames = units.slice(0, per);
    var measures = rows.slice(2).map(function (r) {
      var label = r[0].t, vals = r.slice(1).map(function (c) { return c.t; });
      var byUnit = {};
      unitNames.forEach(function (u, ui) { byUnit[u] = sizes.map(function (_, si) { return vals[si * per + ui]; }); });
      return { label: label, byUnit: byUnit };
    });
    return { sizes: sizes, units: unitNames, measures: measures };
  }

  /* ---------------- bag (cart) ----------------
     Preview: kept in this browser only; checkout is off.
     Live: a real Shopify cart; checkout opens Shopify's hosted checkout. */
  var CART_Q = "id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } } " +
    "lines(first: 50) { nodes { id quantity merchandise { ... on ProductVariant { id title image { url } price { amount currencyCode } product { title handle featuredImage { url } } } } } }";
  function normCart(c) {
    if (!c) return { lines: [], count: 0, subtotal: 0, currency: "USD", checkoutUrl: null };
    var lines = c.lines.nodes.map(function (l) {
      var m = l.merchandise;
      return { id: l.id, variantId: m.id, qty: l.quantity, title: m.product.title, handle: m.product.handle, variantTitle: m.title, price: Number(m.price.amount), currency: m.price.currencyCode, image: (m.image && m.image.url) || (m.product.featuredImage && m.product.featuredImage.url) };
    });
    return { lines: lines, count: c.totalQuantity, subtotal: Number(c.cost.subtotalAmount.amount), currency: c.cost.subtotalAmount.currencyCode, checkoutUrl: c.checkoutUrl };
  }
  var Bag = {
    state: { lines: [], count: 0, subtotal: 0, currency: "USD", checkoutUrl: null },
    load: function () {
      if (!API) { Bag.state = Bag._local(); return Promise.resolve(Bag.state); }
      var id = localStorage.getItem(CART_KEY);
      if (!id) return Promise.resolve(Bag.state);
      return gql("query C($id: ID!) { cart(id: $id) { " + CART_Q + " } }", { id: id }).then(function (d) {
        if (!d.cart) localStorage.removeItem(CART_KEY);
        Bag.state = normCart(d.cart); return Bag.state;
      }).catch(function () { return Bag.state; });
    },
    _local: function () {
      var lines = []; try { lines = JSON.parse(localStorage.getItem(BAG_KEY) || "[]"); } catch (e) {}
      var count = 0, sub = 0; lines.forEach(function (l) { count += l.qty; sub += l.qty * l.price; });
      return { lines: lines, count: count, subtotal: sub, currency: "USD", checkoutUrl: null };
    },
    _save: function (lines) { localStorage.setItem(BAG_KEY, JSON.stringify(lines)); Bag.state = Bag._local(); return Promise.resolve(Bag.state); },
    add: function (product, variant, qty) {
      if (!API) {
        var lines = Bag._local().lines, hit = lines.filter(function (l) { return l.variantId === variant.id; })[0];
        if (hit) hit.qty += qty; else lines.push({ id: variant.id, variantId: variant.id, qty: qty, title: product.title, handle: product.handle, variantTitle: variant.title, price: variant.price, currency: variant.currency, image: variant.image || (product.images[0] && product.images[0].url) });
        return Bag._save(lines);
      }
      var id = localStorage.getItem(CART_KEY), line = [{ merchandiseId: variant.id, quantity: qty }];
      var q = id
        ? gql("mutation A($id: ID!, $l: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $l) { cart { " + CART_Q + " } userErrors { message } } }", { id: id, l: line }).then(function (d) { return d.cartLinesAdd; })
        : gql("mutation N($l: [CartLineInput!]!) { cartCreate(input: { lines: $l }) { cart { " + CART_Q + " } userErrors { message } } }", { l: line }).then(function (d) { return d.cartCreate; });
      return q.then(function (r) {
        if (r.userErrors && r.userErrors.length) throw new Error(r.userErrors[0].message);
        localStorage.setItem(CART_KEY, r.cart.id); Bag.state = normCart(r.cart); return Bag.state;
      });
    },
    setQty: function (lineId, qty) {
      if (!API) {
        var lines = Bag._local().lines.map(function (l) { if (l.id === lineId) l.qty = qty; return l; }).filter(function (l) { return l.qty > 0; });
        return Bag._save(lines);
      }
      var id = localStorage.getItem(CART_KEY);
      var q = qty > 0
        ? gql("mutation U($id: ID!, $l: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $l) { cart { " + CART_Q + " } userErrors { message } } }", { id: id, l: [{ id: lineId, quantity: qty }] }).then(function (d) { return d.cartLinesUpdate; })
        : gql("mutation R($id: ID!, $l: [ID!]!) { cartLinesRemove(cartId: $id, lineIds: $l) { cart { " + CART_Q + " } userErrors { message } } }", { id: id, l: [lineId] }).then(function (d) { return d.cartLinesRemove; });
      return q.then(function (r) { Bag.state = normCart(r.cart); return Bag.state; });
    }
  };

  /* ---------------- shared chrome ---------------- */
  var ICON_BAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';
  var ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';

  function chrome(page) {
    var cur = function (p) { return page === p ? ' aria-current="page"' : ""; };
    var head = document.createElement("div");
    head.innerHTML =
      (CHECKOUT ? "" : '<div class="preview-bar"><b>Preview</b> <span id="src-note">Loading from Shopify\u2026</span></div>') +
      '<header class="s-head"><div class="wrap">' +
        '<a class="s-brand" href="/shop/"><img src="/shop/assets/crest.png" alt="" width="38" height="38"><span>Umoja<small>Club Shop</small></span></a>' +
        '<nav class="s-nav" aria-label="Shop"><a href="/shop/#collection"' + cur("home") + ' data-coll-link>Heritage</a><a href="/shop/#collection">Shop all</a><a href="/shop/help"' + cur("help") + '>Delivery &amp; returns</a><a href="' + esc(C.circleUrl || "/give") + '">The Umoja Circle</a></nav>' +
        '<div class="s-tools">' +
          '<a class="s-club" href="/">&larr; Club site</a>' +
          (C.accountUrl ? '<a class="icon-btn" href="' + esc(C.accountUrl) + '" aria-label="Your account">' + ICON_USER + '</a>' : "") +
          '<button class="icon-btn" type="button" data-open-bag aria-label="Open bag">' + ICON_BAG + '<span class="bag-count" data-n="0">0</span></button>' +
          '<button class="icon-btn s-burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="s-menu">' + ICON_MENU + '</button>' +
        '</div></div>' +
        '<nav class="s-menu" id="s-menu" aria-label="Shop menu">' +
          '<a href="/shop/#collection">Heritage<small>Drop 01, the inaugural collection</small></a>' +
          '<a href="/shop/help">Delivery &amp; returns</a>' +
          (C.accountUrl ? '<a href="' + esc(C.accountUrl) + '">Your account<small>Orders and addresses</small></a>' : "") +
          '<a href="' + esc(C.circleUrl || "/give") + '">The Umoja Circle<small>Supporter membership with members-only rewards</small></a>' +
          '<a href="/">Back to the club<small>umojasoka.com</small></a>' +
        '</nav></header>';
    while (head.firstChild) document.body.insertBefore(head.lastChild, document.body.firstChild);

    var foot = document.createElement("footer");
    foot.className = "s-foot";
    foot.innerHTML = '<div class="stripe thin" aria-hidden="true"></div><div class="wrap">' +
      '<div><img src="/shop/assets/crest.png" alt="Umoja Soccer Club crest" width="64" height="64" style="margin-bottom:14px"><p style="margin:0;max-width:22em">The official shop of Umoja Soccer Club. Clarkston, Georgia. Breaking Barriers. Building Champions.</p></div>' +
      '<div><h4>Shop</h4><a href="/shop/#collection">Heritage Collection</a><a href="/shop/help">Delivery &amp; returns</a><a href="/shop/help#sizing">Sizing</a>' + (C.accountUrl ? '<a href="' + esc(C.accountUrl) + '">Your account</a>' : "") + '</div>' +
      '<div><h4>The club</h4><a href="/">umojasoka.com</a><a href="/programs">The Academy</a><a href="' + esc(C.circleUrl || "/give") + '">The Umoja Circle</a><a href="/sponsors">Community partners</a></div>' +
      '<div><h4>Help</h4><a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + '</a><a href="/contact">Contact the club</a><a href="/privacy">Privacy</a></div>' +
      '<div class="legal"><span>&copy; ' + new Date().getFullYear() + ' Umoja Soccer Club, Inc. A 501(c)(3) nonprofit.</span><span>Secure checkout by Shopify</span></div></div>';
    document.body.appendChild(foot);

    var drawer = document.createElement("div");
    drawer.innerHTML = '<div class="scrim" data-close-bag></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="bag-title" aria-hidden="true">' +
        '<div class="d-head"><h2 id="bag-title">Your bag</h2><button class="d-close" type="button" data-close-bag aria-label="Close bag">&times;</button></div>' +
        '<div class="d-body" id="bag-body"></div><div class="d-foot" id="bag-foot"></div></aside>';
    while (drawer.firstChild) document.body.appendChild(drawer.firstChild);

    var burger = $(".s-burger"), menu = $("#s-menu");
    burger.addEventListener("click", function () { var o = menu.classList.toggle("open"); burger.setAttribute("aria-expanded", o); });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-open-bag]")) openBag();
      if (e.target.closest("[data-close-bag]")) closeBag();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeBag(); });
    if (!CHECKOUT) { var m = document.createElement("meta"); m.name = "robots"; m.content = "noindex, nofollow"; document.head.appendChild(m); }
  }
  var lastFocus = null;
  function openBag() {
    lastFocus = document.activeElement;
    $(".scrim").classList.add("open"); var d = $(".drawer"); d.classList.add("open"); d.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden"; setTimeout(function () { $(".d-close").focus(); }, 50);
  }
  function closeBag() {
    var d = $(".drawer"); if (!d || !d.classList.contains("open")) return;
    $(".scrim").classList.remove("open"); d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; if (lastFocus) lastFocus.focus();
  }
  function renderBag() {
    var s = Bag.state;
    $$(".bag-count").forEach(function (b) { b.textContent = s.count; b.setAttribute("data-n", s.count); });
    var body = $("#bag-body"), foot = $("#bag-foot");
    if (!body) return;
    if (!s.lines.length) {
      body.innerHTML = '<div class="d-empty"><h3>Your bag is empty</h3><p>The Heritage Collection is waiting.</p><a class="btn btn-gold" href="/shop/#collection" data-close-bag>Shop Heritage</a></div>';
      foot.innerHTML = ""; return;
    }
    body.innerHTML = s.lines.map(function (l) {
      return '<div class="line"><a class="im" href="' + productUrl(l.handle) + '">' + (l.image ? '<img src="' + esc(img(l.image, 200)) + '" alt="">' : "") + '</a>' +
        '<div><h4>' + esc(l.title) + '</h4><div class="v">' + esc(l.variantTitle) + '</div>' +
        '<div class="row"><div><span class="qty"><button type="button" data-q="-1" data-line="' + esc(l.id) + '" aria-label="One fewer">&minus;</button><span>' + l.qty + '</span><button type="button" data-q="1" data-line="' + esc(l.id) + '" aria-label="One more">+</button></span>' +
        '<button class="rm" type="button" data-rm="' + esc(l.id) + '">Remove</button></div><b>' + money(l.price * l.qty, l.currency) + '</b></div></div></div>';
    }).join("");
    foot.innerHTML = '<div class="d-sum"><span>Subtotal</span><span>' + money(s.subtotal, s.currency) + '</span></div>' +
      '<p class="small">Shipping, taxes and discount codes are added at checkout.</p>' +
      (CHECKOUT && API && s.checkoutUrl
        ? '<a class="btn btn-gold block" href="' + esc(s.checkoutUrl) + '">Secure checkout</a>'
        : '<button class="btn btn-gold block" type="button" aria-disabled="true" data-preview-checkout>Checkout opens at launch</button>');
  }
  document.addEventListener("click", function (e) {
    var q = e.target.closest("[data-q]"), rm = e.target.closest("[data-rm]"), pc = e.target.closest("[data-preview-checkout]");
    if (q) {
      var line = Bag.state.lines.filter(function (l) { return l.id === q.getAttribute("data-line"); })[0];
      if (line) Bag.setQty(line.id, line.qty + Number(q.getAttribute("data-q"))).then(renderBag);
    }
    if (rm) Bag.setQty(rm.getAttribute("data-rm"), 0).then(renderBag);
    if (pc) toast("Preview only. Checkout switches on at launch.");
  });

  /* ---------------- pages ---------------- */
  function card(p, i) {
    var a = p.images[0], b = p.images[1];
    var sizes = (p.options.filter(function (o) { return /size/i.test(o.name); })[0] || { values: [] }).values;
    var colors = (p.options.filter(function (o) { return /colou?r/i.test(o.name); })[0] || { values: [] }).values;
    var price = p.minPrice === p.maxPrice ? money(p.minPrice, p.currency) : "From " + money(p.minPrice, p.currency);
    var no = ("0" + (i + 1)).slice(-2);
    return '<a class="card" href="' + productUrl(p.handle) + '">' +
      '<div class="ph"><span class="no">No. ' + no + '</span>' +
        (a ? '<img class="main" src="' + esc(img(a.url, 700)) + '" srcset="' + esc(srcset(a.url)) + '" sizes="(min-width:900px) 33vw, 50vw" alt="' + esc(a.altText || p.title) + '" loading="lazy">' : "") +
        (b ? '<img class="alt" src="' + esc(img(b.url, 700)) + '" srcset="' + esc(srcset(b.url)) + '" sizes="(min-width:900px) 33vw, 50vw" alt="" loading="lazy" aria-hidden="true">' : "") +
        '<span class="quick">View</span></div>' +
      '<div class="meta"><h3>' + esc(p.title) + '</h3><span class="price">' + price + '</span></div>' +
      '<div class="sub">' + esc(colors.join(" / ")) + (sizes.length ? " &middot; " + esc(sizes[0]) + "&ndash;" + esc(sizes[sizes.length - 1]) : "") + '</div></a>';
  }

  function initHome() {
    var grid = $("#grid"), tabs = $("#tabs"), title = $("#coll-title"), count = $("#coll-count"), soon = $("#soon");
    grid.innerHTML = new Array(7).join('<div class="card"><div class="ph skeleton"></div></div>');
    loadCatalog().then(function (cat) {
      var cols = cat.collections;
      if (!cols.length) { grid.innerHTML = '<p>New products are on the way. Check back soon.</p>'; return; }
      var start = cols.filter(function (c) { return c.handle === C.featuredCollection; })[0] || cols[0];
      function show(c) {
        title.textContent = c.title;
        count.textContent = c.products.length + (c.products.length === 1 ? " piece" : " pieces");
        grid.innerHTML = c.products.map(card).join("");
        $$(".tab", tabs).forEach(function (t) { t.setAttribute("aria-pressed", t.getAttribute("data-h") === c.handle); });
      }
      tabs.innerHTML = cols.length > 1 ? cols.map(function (c) { return '<button class="tab" type="button" data-h="' + esc(c.handle) + '">' + esc(c.title.replace(/ collection$/i, "")) + '</button>'; }).join("") : "";
      tabs.addEventListener("click", function (e) { var t = e.target.closest(".tab"); if (t) show(cols.filter(function (c) { return c.handle === t.getAttribute("data-h"); })[0]); });
      show(start);
      /* Collections that are planned but not stocked yet: named, never shown as products. */
      var have = cols.map(function (c) { return c.handle; });
      var planned = (C.collectionOrder || []).filter(function (h) { return have.indexOf(h) === -1; });
      if (soon && planned.length) soon.innerHTML = "Coming later" + planned.map(function (h) { return "<span>" + esc(h.charAt(0).toUpperCase() + h.slice(1)) + "</span>"; }).join("");
      /* Hero imagery comes from Shopify too. */
      $$("[data-hero]").forEach(function (fig) {
        var spec = fig.getAttribute("data-hero").split(":"), p = cat.products.filter(function (x) { return x.handle === spec[0]; })[0] || cat.products[+spec[2] || 0];
        var im = p && p.images[+spec[1] || 0];
        if (im) { fig.querySelector("img").src = img(im.url, 900); fig.querySelector("img").srcset = srcset(im.url); fig.querySelector("figcaption").textContent = p.title.replace(/^The /, ""); fig.style.visibility = "visible"; }
      });
    }).catch(function (err) {
      grid.innerHTML = '<p>The shop could not load just now. Please refresh, or email <a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + '</a>.</p>';
      if (window.console) console.error(err);
    });
  }

  function reviewNotes(p, d) {
    if (CHECKOUT) return "";
    var notes = [];
    if (/on-demand printing|personalize it/i.test(d.intro)) notes.push("This description is the supplier's stock text. Replace it with Heritage copy in Shopify.");
    if (!d.size) notes.push("No size chart in Shopify for this product yet. Restore the supplier's chart in the product description and it appears here automatically.");
    if (!d.sections.length) notes.push("No fabric or care details in Shopify yet. Restore the supplier's specs and they appear here automatically.");
    if (/snow-washed|essential|heavyweight|unisex|two-tone/.test(p.handle)) notes.push("Web address uses the supplier's name (" + p.handle + "). Optional: change the handle in Shopify to something like the product name.");
    return notes.map(function (n) { return '<div class="review">' + esc(n) + "</div>"; }).join("");
  }

  function initProduct() {
    var m = location.pathname.match(/\/shop\/p\/([^\/?#]+)/), handle = m ? decodeURIComponent(m[1]) : new URLSearchParams(location.search).get("h");
    var root = $("#pdp");
    loadProduct(handle).then(function (res) {
      var p = res.product;
      if (!p) { root.innerHTML = '<div style="padding:60px 0"><h1 style="font-size:48px">Not found</h1><p class="lede">This piece isn&rsquo;t in the shop right now.</p><a class="btn btn-gold" href="/shop/">Back to the shop</a></div>'; return; }
      document.title = p.title + " | Umoja Club Shop";
      var d = parseDescription(p.descriptionHtml);
      var coll = res.catalog.collections.filter(function (c) { return c.products.some(function (x) { return x.handle === p.handle; }); })[0];
      var sel = {};
      p.options.forEach(function (o) { if (o.values.length === 1) sel[o.name] = o.values[0]; });
      var sizeOpt = p.options.filter(function (o) { return /size/i.test(o.name); })[0];

      var gallery = '<div class="gallery"><div class="stage" id="stage">' + p.images.map(function (im, i) {
        return '<figure><img src="' + esc(img(im.url, 1000)) + '" srcset="' + esc(srcset(im.url)) + '" sizes="(min-width:960px) 55vw, 100vw" alt="' + esc(im.altText || (p.title + ", image " + (i + 1) + " of " + p.images.length)) + '"' + (i ? ' loading="lazy"' : "") + '></figure>';
      }).join("") + '</div>' +
        (p.images.length > 1 ? '<div class="dots" aria-hidden="true">' + p.images.map(function (_, i) { return '<i' + (i ? "" : ' class="on"') + '></i>'; }).join("") + '</div>' +
        '<div class="thumbs">' + p.images.map(function (im, i) { return '<button type="button" data-i="' + i + '" aria-label="Show image ' + (i + 1) + '"' + (i ? "" : ' aria-current="true"') + '><img src="' + esc(img(im.url, 200)) + '" alt=""></button>'; }).join("") + '</div>' : "") + '</div>';

      var optsHtml = p.options.map(function (o) {
        var isColor = /colou?r/i.test(o.name), isSize = /size/i.test(o.name);
        return '<fieldset class="opt" data-opt="' + esc(o.name) + '"><legend>' + esc(o.name) + ' <output>' + esc(sel[o.name] || "") + '</output>' + (isSize && d.size ? '<button class="link" type="button" data-sizeguide>Size guide</button>' : "") + '</legend><div class="chips">' +
          o.values.map(function (v) {
            var sw = isColor ? SWATCH[v.toLowerCase()] : null;
            return '<button class="chip" type="button" data-v="' + esc(v) + '" aria-pressed="' + (sel[o.name] === v) + '">' + (sw ? '<span class="dot" style="background:' + sw + '"></span>' : "") + esc(v) + '</button>';
          }).join("") + '</div></fieldset>';
      }).join("");

      var specs = d.sections.map(function (s) {
        return '<h4>' + esc(s.title.replace(/ instructions$/i, "")) + '</h4><ul>' + s.items.map(function (it) {
          var kv = it.split(/:\s*/); return kv.length > 1 ? '<li><span>' + esc(kv[0]) + '</span><span>' + esc(kv.slice(1).join(": ")) + '</span></li>' : '<li><span>' + esc(it) + '</span><span></span></li>';
        }).join("") + '</ul>';
      }).join("");

      root.innerHTML = '<div class="crumbs"><a href="/shop/">Shop</a> / ' + (coll ? '<a href="/shop/#collection">' + esc(coll.title) + '</a> / ' : "") + esc(p.title) + '</div>' +
        '<div class="pdp">' + gallery +
        '<div class="buy"><span class="eyebrow">' + esc(coll ? coll.title : "Umoja Club Shop") + '</span><h1>' + esc(p.title) + '</h1>' +
          '<div class="price" id="price">' + money(p.minPrice, p.currency) + '</div>' + optsHtml +
          '<div class="add-row"><button class="btn btn-gold block" type="button" id="add">Select a size</button></div>' +
          '<div class="assure"><div><b>Made for you</b>Made to order</div><div><b>Secure</b>Shopify checkout</div><div><b>Club</b>Proceeds to Umoja</div></div>' +
          '<a class="circle-note" href="' + esc(C.circleUrl || "/give") + '"><img src="/shop/assets/crest.png" alt="" width="34" height="34"><span><b>Members of The Umoja Circle</b> earn exclusive pieces that are never sold in the shop. Join from $10 a month.</span><i aria-hidden="true">&rarr;</i></a>' +
          reviewNotes(p, d) +
          '<div class="acc">' +
            '<details open><summary>Details</summary><div class="in">' + (d.intro || "<p>Part of the Umoja Club Shop.</p>") + '</div></details>' +
            (specs ? '<details><summary>Fabric &amp; care</summary><div class="in">' + specs + '</div></details>' : "") +
            (d.size ? '<details id="size-guide"><summary>Size guide</summary><div class="in"><div class="unit" role="group" aria-label="Units">' + d.size.units.map(function (u, i) { return '<button type="button" data-unit="' + esc(u) + '" aria-pressed="' + (i === 0) + '">' + esc(u) + '</button>'; }).join("") + '</div><div class="sz-wrap" id="sz"></div><p class="small">Garment measurements from the maker, laid flat. Chest is measured across the front.</p></div></details>'
                    : '<details><summary>Size guide</summary><div class="in"><p>Questions about fit? Email <a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + '</a> and we&rsquo;ll help.</p></div></details>') +
            '<details><summary>Delivery &amp; returns</summary><div class="in"><p>Every piece is made to order by our production partner, then shipped to you. Shipping options and costs show at checkout before you pay.</p><p><a href="/shop/help">Delivery and returns details</a></p></div></details>' +
          '</div></div></div>' +
        '<div class="m-buy" id="m-buy"><div class="t"><b>' + esc(p.title) + '</b><span id="m-price">' + money(p.minPrice, p.currency) + '</span></div><button class="btn btn-gold" type="button" id="m-add">Select a size</button></div>';

      /* size table */
      var unit = d.size ? d.size.units[0] : null;
      function drawSize() {
        if (!d.size) return;
        var picked = sizeOpt ? sel[sizeOpt.name] : null;
        $("#sz").innerHTML = '<table class="sz"><thead><tr><th scope="col">' + esc(unit) + '</th>' + d.size.sizes.map(function (s) { return '<th scope="col">' + esc(s) + '</th>'; }).join("") + '</tr></thead><tbody>' +
          d.size.measures.map(function (r) { return '<tr><td>' + esc(r.label) + '</td>' + r.byUnit[unit].map(function (v, i) { return '<td' + (d.size.sizes[i] === picked ? ' style="color:var(--gold);font-weight:700"' : "") + '>' + esc(v) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table>';
      }
      drawSize();
      root.addEventListener("click", function (e) {
        var u = e.target.closest("[data-unit]");
        if (u) { unit = u.getAttribute("data-unit"); $$("[data-unit]").forEach(function (b) { b.setAttribute("aria-pressed", b === u); }); drawSize(); }
        if (e.target.closest("[data-sizeguide]")) { var sg = $("#size-guide"); sg.open = true; sg.scrollIntoView({ behavior: "smooth", block: "start" }); }
      });

      /* gallery */
      var stage = $("#stage");
      function goTo(i) { stage.scrollTo({ left: stage.clientWidth * i, behavior: "smooth" }); }
      $$(".thumbs button").forEach(function (b) { b.addEventListener("click", function () { goTo(+b.getAttribute("data-i")); }); });
      stage.addEventListener("scroll", function () {
        var i = Math.round(stage.scrollLeft / stage.clientWidth);
        $$(".thumbs button").forEach(function (b, j) { b.setAttribute("aria-current", j === i); });
        $$(".dots i").forEach(function (dt, j) { dt.classList.toggle("on", j === i); });
      }, { passive: true });

      /* variant selection */
      function current() {
        return p.variants.filter(function (v) { return p.options.every(function (o) { return v.options[o.name] === sel[o.name]; }); })[0] || null;
      }
      function sync() {
        var v = current();
        $$(".opt").forEach(function (fs) {
          var name = fs.getAttribute("data-opt");
          fs.querySelector("output").textContent = sel[name] || "";
          $$(".chip", fs).forEach(function (ch) {
            var val = ch.getAttribute("data-v");
            ch.setAttribute("aria-pressed", sel[name] === val);
            var probe = {}; for (var k in sel) probe[k] = sel[k]; probe[name] = val;
            var any = p.variants.some(function (x) { return x.available && p.options.every(function (o) { return !probe[o.name] || x.options[o.name] === probe[o.name]; }); });
            ch.disabled = !any;
          });
        });
        var label, ok = false;
        if (!v) { var miss = p.options.filter(function (o) { return !sel[o.name]; })[0]; label = "Select a " + (miss ? miss.name.toLowerCase() : "size"); }
        else if (!v.available) label = "Sold out";
        else { label = "Add to bag  " + money(v.price, v.currency); ok = true; }
        [$("#add"), $("#m-add")].forEach(function (b) { b.textContent = label; b.setAttribute("aria-disabled", !ok); b.dataset.ok = ok ? "1" : ""; });
        var pr = v ? money(v.price, v.currency) : money(p.minPrice, p.currency);
        $("#price").textContent = pr; $("#m-price").textContent = pr;
        if (v && v.image) { var idx = p.images.map(function (im) { return im.url.split("?")[0]; }).indexOf(v.image.split("?")[0]); if (idx > -1) goTo(idx); }
        drawSize();
      }
      $$(".opt").forEach(function (fs) {
        fs.addEventListener("click", function (e) {
          var ch = e.target.closest(".chip"); if (!ch || ch.disabled) return;
          sel[fs.getAttribute("data-opt")] = ch.getAttribute("data-v"); sync();
        });
      });
      function add(btn) {
        if (!btn.dataset.ok) {
          var fs = $$(".opt").filter(function (f) { return !sel[f.getAttribute("data-opt")]; })[0];
          if (fs) { fs.scrollIntoView({ behavior: "smooth", block: "center" }); fs.animate && fs.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 300 }); }
          return;
        }
        var v = current(), old = btn.textContent; btn.textContent = "Adding…";
        Bag.add(p, v, 1).then(function () { renderBag(); btn.textContent = old; openBag(); })
          .catch(function (err) { btn.textContent = old; toast(err.message || "Couldn’t add that. Please try again."); });
      }
      $("#add").addEventListener("click", function () { add(this); });
      $("#m-add").addEventListener("click", function () { add(this); });
      sync();

      /* mobile sticky bar appears once the main button scrolls away */
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) { $("#m-buy").classList.toggle("show", !en[0].isIntersecting && en[0].boundingClientRect.top < 0); }).observe($("#add"));
      }

      /* more from the collection */
      var more = $("#more");
      if (more && coll) {
        var others = coll.products.filter(function (x) { return x.handle !== p.handle; }).slice(0, 3);
        if (others.length) { more.hidden = false; $("#more-grid").innerHTML = others.map(function (x) { return card(x, coll.products.indexOf(x)); }).join(""); $("#more-title").textContent = "More from " + coll.title; }
      }
    }).catch(function (err) {
      root.innerHTML = '<p style="padding:60px 0">This page could not load just now. Please refresh.</p>'; if (window.console) console.error(err);
    });
  }

  function initHelp() {
    var ship = $("#policy-shipping"), ret = $("#policy-returns");
    if (!API) {
      ship.innerHTML = '<div class="review">Shopify has no shipping policy yet. Write it in Shopify (Settings &gt; Policies) and it appears here automatically at launch.</div>';
      ret.innerHTML = '<div class="review">Shopify has no refund policy yet. Write it in Shopify (Settings &gt; Policies) and it appears here automatically at launch.</div>';
      return;
    }
    gql("query { shop { shippingPolicy { body } refundPolicy { body } } }").then(function (d) {
      ship.innerHTML = d.shop.shippingPolicy ? '<div class="policy">' + d.shop.shippingPolicy.body + '</div>' : "";
      ret.innerHTML = d.shop.refundPolicy ? '<div class="policy">' + d.shop.refundPolicy.body + '</div>' : "";
    }).catch(function () {});
  }

  document.addEventListener("shop:source", function () {
    var n = document.getElementById("src-note"); if (!n) return;
    n.textContent = {
      live: "Live data from Shopify. The bag is a real Shopify cart; checkout is switched off until launch.",
      empty: "Connected to Shopify. Products are still drafts, so this shows a snapshot of them. Checkout is off.",
      error: "Couldn\u2019t reach Shopify just now, so this shows a snapshot of the products. Checkout is off.",
      snapshot: "Snapshot of the draft products. Checkout is off."
    }[SOURCE_NOTE] || "";
  });

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.getAttribute("data-page");
    chrome(page);
    /* Circle links follow circleUrl in the config, keeping any #section. */
    $$("[data-circle-link]").forEach(function (a) {
      var h = a.getAttribute("href"), i = h.indexOf("#");
      a.setAttribute("href", (C.circleUrl || "/give") + (i > -1 ? h.slice(i) : ""));
    });
    renderBag();
    loadCatalog().then(function () { return Bag.load(); }).then(renderBag);
    if (page === "home") initHome();
    if (page === "product") initProduct();
    if (page === "help") loadCatalog().then(initHelp);
  });
})();
