# Orbit

A virtual fitting room for fashion brands. A brand adds a garment from two photos; a shopper dresses a faceless mannequin from the catalogue, turns it, walks it through five places, and then sees the same outfit on their own body from one photo.

Built for the Meta Global AI Developer Hackathon. Everything in this repository was made during the event.

## Run

Requires Node 20.19 or newer.

```bash
npm install
npm run dev
```

Opens on http://localhost:5192. Every look already in `cache/looks` and `public/studio/set` plays without a key.

To add a garment, dress a new combination or try a look on a photo, add a Meta Model API key:

```bash
echo "META_API_KEY=your-key" > .env.local
```

## How Meta's models are used

Three Meta models run in the product, all through the Meta Model API with one key: `muse-image-1.0` makes every image, `muse-spark-1.3` reads garments, and `sam-3.1` cuts garments and people out. Every call is logged with its cost (`node scripts/muse.mjs usage`).

### A brand adds a garment

`Add a garment`, in the wardrobe, takes a photo of the front and one of the back, on any background. The page shows each model at work, step by step:

1. **Muse Spark** (`muse-spark-1.3`, Responses API with a strict JSON schema) looks at both photos and returns a catalogue entry: kind, name, colour, material, a one-line description, and a short phrase that names the garment for SAM. It also says when the photos are not one garment.
2. **SAM 3.1** (`sam-3.1`, Responses API) is given that phrase and each photo, and returns the garment's mask. The page traces SAM's outline around the garment, then the background falls away and the cut garment lifts.
3. The brand checks the details, sets the price, and hangs it. It appears first on its rail, marked `New`, and from then on Muse dresses the mannequin in it like any other garment.

`server/catalog.mjs` streams each step as it finishes and keeps the brand's garments in `cache/catalog`. The 36 garments of the base catalogue cannot be removed; a brand's own garments can be taken out, with a moment to undo, and are only marked as removed, never deleted. Garment reads are capped per day and per visitor (`CATALOG_DAILY_LIMIT`, `CATALOG_VISITOR_LIMIT`).

### Pin, the stylist

Pin lives at the head of the wardrobe: a tailor's dress form with a pincushion for a hat, drawn once with Muse Image (`public/studio/stylist/pin.webp`), a short conversation and a line to write on. **Muse Spark** speaks for Pin. Ask for a look ("a wedding in the country, by day") and Pin dresses the mannequin, picks the room and says why; ask what it thinks of what you put together and it judges whether the pieces go (layering, colour, formality, season), names the piece that is wrong and puts the fix on. Pin answers in the shopper's language and follows the thread of the conversation.

Spark is given the whole wardrobe in words: each brand garment as Spark read it when it was added, and the 36 base garments as Spark read them once from their pictures (`scripts/catalogue-base.mjs`, kept in `src/catalogue-notes.json`). Its answer is held by a strict JSON schema to the catalogue's ids, so it can only pick what exists, and it is told which outfits are already photographed so it leans on those, which show at once and cost nothing. `server/stylist.mjs`; capped by `STYLIST_DAILY_LIMIT` and `STYLIST_VISITOR_LIMIT`. Each answer costs well under a cent. The conversation stays in the page.

### Muse Image

- **While building:** the 36 garments, front and back, the five places, the stands and both mannequins. `scripts/build-man.mjs` cuts his views from his sheet, `scripts/generate-garments.mjs` and `scripts/generate-places.mjs` make them, and `scripts/build-studio.py` cuts them out of their green screens.
- **Dressing the mannequin:** `server/looks.mjs` asks Muse for one sheet with four views of a combination, cuts it apart, and saves it. Each combination is paid for once, per mannequin, and then served to everyone from disk. The man's looks are made this way the first time someone asks for them.
- **Trying it on:** `server/try-on.mjs` makes two images of the shopper and streams each one as soon as Muse finishes it, front first, with the back made from that front. SAM 3.1 then finds the person in each image. `src/try-on.js` cuts them out in the browser so they stand on the same stand as the mannequin: SAM decides what is the person, so nothing green they wear is cut away and no patch of backdrop stays, and a chroma key draws the fine edge of hair and fingers.

Once the shopper is on the stand, `src/print.js` draws them into the chosen room as an instant photo to download or share. It happens in the browser, so the picture never goes back to a server. Each try-on adds its photo to a pile beside the figure. The last 12 stay in that browser only (IndexedDB, `src/album.js`), where the shopper can open, download or delete them, turn each one between front and back, and put an earlier try-on back on the stand at no cost. A discreet button asks Muse for the current try-on again when it came out wrong, which costs two more images.

The photo stays in memory for the length of the request and is never written to disk. Try-ons are capped per day and per visitor. Set `TRY_ON_DAILY_LIMIT` and `TRY_ON_VISITOR_LIMIT` to change the caps.

## What it does not do

The figure does not really rotate: it swaps between four views. A try-on shows front and back only. The base catalogue, prices and brand are invented, and there is no checkout. Adding garments has no sign-in: anyone with the link can add one, within the caps above: `Shop this look` opens a simulated store with the look in its cart. Set `VITE_STORE_URL` to a real cart address and its checkout button goes there with `?items=` and the ids of the pieces.

## Layout

- `index.html`, `src/`: the app. `src/wardrobe.js` holds the catalogue.
- `server/`: the endpoints, mounted by `vite.config.js`. Muse Image goes through `server/muse.mjs`, SAM 3.1 and Muse Spark through `server/meta.mjs`; both log every billed call. With `META_MOCK=1`, SAM and Spark are simulated locally, to try the brand flow without spending.
- `scripts/`: rebuild the assets. Needs Python 3.12 with `numpy`, `opencv-python-headless` and `pillow`.
- `public/studio/`: garments, places, stands and looks.
- `cache/looks/`: combinations Muse has already dressed. `cache/catalog/`: garments a brand added, created on first use.

## Third-party

Fonts: Cormorant Garamond and Hanken Grotesk from Google Fonts. Libraries: Vite, sharp, and Meta's `@meta-sam/parser` (SAM License) to read SAM 3.1's masks. No other third-party assets.
