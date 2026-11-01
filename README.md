# Orbit

A virtual fitting room for fashion brands. A shopper dresses a faceless mannequin from the brand's catalogue, turns it, walks it through five places, and then sees the same outfit on their own body from one photo.

Built for the Meta Global AI Developer Hackathon. Everything in this repository was made during the event.

## Run

Requires Node 20.19 or newer.

```bash
npm install
npm run dev
```

Opens on http://localhost:5192. Every look already in `cache/looks` and `public/studio/set` plays without a key.

To dress a new combination or try a look on a photo, add a Meta Model API key:

```bash
echo "META_API_KEY=your-key" > .env.local
```

## How Muse is used

All images come from `muse-image-1.0`, Meta's image model, through `POST /images/edits`.

- **While building:** the 36 garments, front and back, the five places, the stands and both mannequins. `scripts/build-man.mjs` cuts his views from his sheet, `scripts/generate-garments.mjs` and `scripts/generate-places.mjs` make them, and `scripts/build-studio.py` cuts them out of their green screens.
- **Dressing the mannequin:** `server/looks.mjs` asks Muse for one sheet with four views of a combination, cuts it apart, and saves it. Each combination is paid for once, per mannequin, and then served to everyone from disk. The man's looks are made this way the first time someone asks for them.
- **Trying it on:** `server/try-on.mjs` makes two images of the shopper and streams each one as soon as Muse finishes it, front first, with the back made from that front. `src/try-on.js` cuts them out in the browser so they stand on the same stand as the mannequin.

Once the shopper is on the stand, `src/print.js` draws them into the chosen room as an instant photo to download or share. It happens in the browser, so the picture never goes back to a server.

The photo stays in memory for the length of the request and is never written to disk. Try-ons are capped per day and per visitor. Set `TRY_ON_DAILY_LIMIT` and `TRY_ON_VISITOR_LIMIT` to change the caps.

## What it does not do

The figure does not really rotate: it swaps between four views. A try-on shows front and back only. The catalogue, prices and brand are invented, and there is no checkout: `Shop this look` opens a simulated store with the look in its cart. Set `VITE_STORE_URL` to a real cart address and its checkout button goes there with `?items=` and the ids of the pieces.

## Layout

- `index.html`, `src/`: the app. `src/wardrobe.js` holds the catalogue.
- `server/`: the two endpoints, mounted by `vite.config.js`. All calls to Muse go through `server/muse.mjs`, which logs every billed image.
- `scripts/`: rebuild the assets. Needs Python 3.12 with `numpy`, `opencv-python-headless` and `pillow`.
- `public/studio/`: garments, places, stands and looks.
- `cache/looks/`: combinations Muse has already dressed.

## Third-party

Fonts: Cormorant Garamond and Hanken Grotesk from Google Fonts. Libraries: Vite and sharp. No other third-party assets.
