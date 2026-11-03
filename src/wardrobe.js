// The catalogue. Length is in centimetres, drawn at the mannequin's scale. Names and prices are placeholders until a
// brand's own catalogue takes their place.
export const KINDS = [
  { id: 'tops', label: 'Tees', slot: 'top', length: 70 },
  { id: 'shirts', label: 'Shirts', slot: 'top', length: 75 },
  { id: 'knits', label: 'Knitwear', slot: 'top', length: 70 },
  { id: 'outerwear', label: 'Outerwear', slot: 'outer', length: 72.5 },
  { id: 'dresses', label: 'Dresses', slot: 'top', length: 111, whole: true },
  { id: 'denim', label: 'Denim', slot: 'bottom', length: 104 },
  { id: 'trousers', label: 'Trousers', slot: 'bottom', length: 104 },
  { id: 'skirts', label: 'Skirts', slot: 'bottom', length: 78 },
  { id: 'shoes', label: 'Shoes', slot: 'shoes', length: 40 },
];

const PIECES = {
  tops: [['tee', 'Bone cotton tee', 38], ['tee-ink', 'Ink heavyweight tee', 42], ['tee-breton', 'Breton stripe tee', 48], ['tee-rust', 'Rust garment-dyed tee', 44], ['tee-sage', 'Sage slub tee', 46], ['tee-tiedye', 'Pastel tie-dye tee', 52]],
  shirts: [['oxford', 'Pale blue oxford', 78, 'shirt'], ['shirt-white', 'White linen shirt', 88], ['shirt-flannel', 'Grey check flannel', 84], ['shirt-stripe', 'Bengal stripe shirt', 82], ['shirt-pink', 'Pale pink oxford', 80], ['shirt-camp', 'Palm print camp shirt', 96], ['blouse-lace', 'Ivory lace blouse', 132]],
  knits: [['knit-cable', 'Cream cable-knit sweater', 168], ['knit-fairisle', 'Fair Isle yoke sweater', 186], ['knit-mohair', 'Moss mohair cardigan', 174], ['knit-roll', 'Black merino rollneck', 142], ['sweat-floral', 'Embroidered flower sweatshirt', 128], ['hoodie', 'Oatmeal hoodie', 98]],
  outerwear: [['jacket', 'Olive field jacket', 164], ['jacket-denim', 'Mid-wash trucker jacket', 138], ['jacket-bomber', 'Black nylon bomber', 152], ['jacket-camel', 'Camel wool coat', 228], ['jacket-leather', 'Black leather biker', 298], ['jacket-navy', 'Navy wool pea coat', 248], ['jacket-puffer', 'Black quilted puffer', 220], ['jacket-fringe', 'Tan suede fringe jacket', 320], ['jacket-patch', 'Embroidered patch denim jacket', 196], ['blazer-tweed', 'Herringbone tweed blazer', 268], ['jacket-varsity', 'Varsity jacket', 230]],
  dresses: [['dress', 'Terracotta linen dress', 142], ['dress-black', 'Black crepe midi', 158], ['dress-navy', 'Navy shirt dress', 136], ['dress-sage', 'Sage linen midi', 148], ['dress-red', 'Crimson wrap dress', 164], ['dress-cream', 'Cream slip dress', 152], ['dress-floral', 'Wildflower maxi dress', 176], ['dress-sequin', 'Gold sequin slip dress', 238]],
  denim: [['jeans', 'Indigo selvedge jeans', 118], ['jeans-black', 'Black straight jeans', 112], ['jeans-light', 'Light wash jeans', 108], ['jeans-ecru', 'Ecru undyed jeans', 114], ['jeans-grey', 'Washed grey jeans', 116], ['jeans-patch', 'Patchwork jeans', 168]],
  trousers: [['chinos', 'Sand chinos', 96], ['pants-charcoal', 'Charcoal wool trouser', 136], ['pants-olive', 'Olive cargo pant', 104], ['pants-cream', 'Cream pleated trouser', 124], ['pants-rust', 'Rust corduroy trouser', 118]],
  skirts: [['skirt-pleat', 'Camel pleated midi skirt', 118], ['skirt-denim', 'Denim midi skirt', 92], ['skirt-satin', 'Black satin skirt', 124], ['skirt-tartan', 'Tartan wrap skirt', 136]],
  shoes: [['sneakers', 'White leather sneakers', 110], ['boots-chelsea', 'Black Chelsea boots', 210], ['loafers', 'Brown suede loafers', 186], ['hightops', 'Red canvas high-tops', 78], ['sandals', 'Tan strap sandals', 120], ['boots-western', 'Embroidered western boots', 290], ['runners', 'Chunky trail runners', 150]],
};

const BASE = KINDS.flatMap((kind) => PIECES[kind.id].map(([id, name, price, file]) => ({
  id,
  name,
  price,
  file: file ?? id,
  category: kind.id,
  slot: kind.slot,
  length: kind.length,
  whole: kind.whole,
  image: `studio/set/item-${file ?? id}.webp`,
  back: `studio/set/item-${file ?? id}-back.webp`,
})));

// What the catalogue holds now: the base set, which never changes, and in front of each kind the garments a store added.
// The array and the map below are filled in place, so every module that imported them sees a store's additions.
export const WARDROBE = [];

// Three layers: one thing on the torso, a jacket over it, and something on the legs. A jacket is worn open, so with
// nothing chosen under it, it goes over the plain tee.
export const UNDER = BASE[0];

export function lookId(top, bottom, outer) {
  const base = top || bottom ? `${top?.id ?? 'none'}-${bottom?.id ?? 'none'}` : 'bare';
  if (!outer) return base;
  if (top === UNDER) return `${outer.id}-${bottom?.id ?? 'none'}`;
  return top ? `${outer.id}-over-${base}` : `${outer.id}-open-${bottom?.id ?? 'none'}`;
}

// The man's looks are the same catalogue under their own ids, drawn on his own mannequin.
export const MAN = 'man-';
export const plainLook = (id) => (id.startsWith(MAN) ? id.slice(MAN.length) : id);

// Every combination the catalogue allows, and so everything the server will ever agree to generate.
export const LOOKS = new Map();

/** A store's garment, in the shape the catalogue uses. Its images are served by the catalogue API. */
export function storeItem({ id, name, price, kind, description, colour, material }) {
  const of = KINDS.find((entry) => entry.id === kind);
  return {
    id,
    name,
    price,
    file: id,
    category: of.id,
    slot: of.slot,
    length: of.length,
    whole: of.whole,
    store: true,
    description,
    colour,
    material,
    image: `api/catalog/files/item-${id}.webp`,
    back: `api/catalog/files/item-${id}-back.webp`,
  };
}

/** Rebuilds the catalogue from the base set and the store's live garments. */
export function setStoreItems(entries) {
  const added = entries.map(storeItem);
  WARDROBE.splice(0, WARDROBE.length, ...KINDS.flatMap((kind) => [
    ...added.filter((item) => item.category === kind.id),
    ...BASE.filter((item) => item.category === kind.id),
  ]));
  const pick = (slot) => WARDROBE.filter((item) => item.slot === slot);
  LOOKS.clear();
  for (const outer of [null, ...pick('outer')]) {
    for (const top of [null, ...pick('top')]) {
      for (const bottom of top?.whole ? [null] : [null, ...pick('bottom')]) {
        const id = lookId(top, bottom, outer);
        if ((top || bottom || outer) && !LOOKS.has(id)) LOOKS.set(id, { top, bottom, outer });
      }
    }
  }
}

setStoreItems([]);
