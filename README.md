# Kaminos Chase Cover Configurator

The interactive 3D product configurator embedded on the Kaminos **chase cover**
product page. Customers set dimensions, hole placements, material, gauge and
finish; they see a live 3D preview and price, then add their custom build
straight to the cart (with AR preview and a downloadable PDF spec sheet).

- **Live (production):** https://chase-cover-configurator.vercel.app
- **Embedded on:** the Kaminos Shopify chase-cover product page
- **Repo:** https://github.com/kaminosofficial/chase-cover-configurator

---

## For the store owner (no developer needed)

### Change prices
All prices come from a **Google Sheet**. Edit the sheet and the new prices go
live on the site **within about 5 minutes** — no code change, no developer, no
redeploy.

- The sheet is the pricing sheet shared with you (ask your developer for the link
  if you don't have it).
- Edit the **values** only. Don't rename, move, or delete the label cells next to
  them — those are how the site finds each price.
- A change takes up to ~5 minutes to appear (the site caches prices briefly).

### If something looks wrong
1. Hard-refresh the product page (Ctrl/Cmd + Shift + R).
2. Check the pricing sheet is reachable and the values look right.
3. Still wrong? Contact your developer — full technical docs and history are in
   [CLAUDE.md](CLAUDE.md).

---

## For developers

- **Full technical docs:** [CLAUDE.md](CLAUDE.md) — architecture, Shopify cart
  flow, pricing, 3D geometry, decision history.
- **How to ship changes safely:** [SHIPPING.md](SHIPPING.md) — branches,
  previews, the automatic check, the merge flow.
- **Shopify embed setup:** [SHOPIFY-INTEGRATION-GUIDE.md](SHOPIFY-INTEGRATION-GUIDE.md).

Quickstart:

```bash
npm install
npm run dev          # http://localhost:5173
```
