/* ------------------------------------------------------------------
   UMOJA CLUB SHOP: the one file to edit when the shop goes live.

   checkoutEnabled
     false  PREVIEW. Gold preview bar, checkout button switched off,
            search engines told not to index the shop.
     true   LAUNCH. Shoppers go to Shopify's secure checkout. Only switch
            this on after Juliana approves the launch.

   dataSource
     "shopify"   Read products and run the bag through Shopify's Storefront
                 API (Headless channel "Umoja Club Shop Headless"). If
                 Shopify returns no products, for example because they are
                 still drafts, the shop shows preview-catalog.json instead.
     "snapshot"  Always show preview-catalog.json.

   The token below is the Headless channel's PUBLIC Storefront token,
   which is designed to sit in browser code. Never paste the private token.
------------------------------------------------------------------- */
window.SHOP_CONFIG = {
  checkoutEnabled: false,
  dataSource: "shopify",

  storeDomain: "u0kspi-sv.myshopify.com",
  storefrontToken: "2dc97c20650c12ff445d43df14e0f473",   /* Headless channel, public token */
  apiVersion: "2026-10",

  /* Collections, in the order they appear in the shop menu. Only
     collections that exist in Shopify AND hold at least one product
     available on the shop are shown, so empty ones stay hidden. New
     collections created in Shopify also appear automatically, after these. */
  collectionOrder: ["heritage", "essentials", "performance", "family", "accessories"],
  featuredCollection: "heritage",

  /* Safety net for The Umoja Circle: products with this tag, and
     collections whose handle starts with "circle", are never shown or
     sold here, even if they are published by mistake. */
  hiddenTag: "circle-exclusive",
  hiddenCollectionPrefix: "circle",
  /* Extra belt and braces: these exact products are member-only and are
     never shown, whatever their tags or collections. */
  hiddenHandles: ["exclusive-umoja-circle-shirt"],

  /* Shopify customer accounts (order history, addresses). Shopify hosts
     the sign-in page. Leave blank until accounts are switched on. */
  accountUrl: "",

  /* The Umoja Circle (supporter membership, run on Givebutter). /give works
     today and redirects to /circle once the Circle page is live. */
  circleUrl: "/give",

  contactEmail: "info@umojasoka.com"
};
