/* ------------------------------------------------------------------
   UMOJA CLUB SHOP: the one file to edit when the shop goes live.

   mode
     "preview"  Shows the draft Heritage products from preview-catalog.json
                (a snapshot of Shopify). The bag works, checkout is switched
                off, and search engines are told not to index the shop.
     "live"     Reads products, prices and stock straight from Shopify and
                sends shoppers to Shopify's secure checkout.

   To launch: publish the products to the Headless sales channel in
   Shopify, paste the channel's PUBLIC Storefront token below, set mode to
   "live", and remove the /shop lines from _redirects if any were added.
   The public token is designed to sit in browser code. Never paste the
   private token here.
------------------------------------------------------------------- */
window.SHOP_CONFIG = {
  mode: "preview",

  storeDomain: "u0kspi-sv.myshopify.com",
  storefrontToken: "",          /* Headless channel > public access token */
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

  /* Shopify customer accounts (order history, addresses). Shopify hosts
     the sign-in page. Leave blank until accounts are switched on. */
  accountUrl: "",

  contactEmail: "info@umojasoka.com"
};
