// The catalogue. Length is in centimetres, drawn at the mannequin's scale. Names and prices are placeholders until a
// brand's own catalogue takes their place.
export const KINDS = [
  { id: 'tops', label: 'Tees', slot: 'top', length: 70 },
  { id: 'shirts', label: 'Shirts', slot: 'top', length: 75 },
  { id: 'outerwear', label: 'Outerwear', slot: 'outer', length: 72.5 },
  { id: 'dresses', label: 'Dresses', slot: 'top', length: 111, whole: true },
  { id: 'denim', label: 'Denim', slot: 'bottom', length: 104 },
  { id: 'trousers', label: 'Trousers', slot: 'bottom', length: 104 },
];

const PIECES = {
  tops: [['tee', 'Bone cotton tee', 38], ['tee-ink', 'Ink heavyweight tee', 42], ['tee-breton', 'Breton stripe tee', 48], ['tee-rust', 'Rust garment-dyed tee', 44], ['tee-sage', 'Sage slub tee', 46], ['tee-navy', 'Navy pocket tee', 44]],
  shirts: [['oxford', 'Pale blue oxford', 78, 'shirt'], ['shirt-white', 'White linen shirt', 88], ['shirt-flannel', 'Grey check flannel', 84], ['shirt-stripe', 'Bengal stripe shirt', 82], ['shirt-chambray', 'Chambray work shirt', 92], ['shirt-pink', 'Pale pink oxford', 80]],
  outerwear: [['jacket', 'Olive field jacket', 164], ['jacket-denim', 'Mid-wash trucker jacket', 138], ['jacket-bomber', 'Black nylon bomber', 152], ['jacket-camel', 'Camel wool coat', 228], ['jacket-leather', 'Black leather biker', 298], ['jacket-navy', 'Navy wool pea coat', 248]],
  dresses: [['dress', 'Terracotta linen dress', 142], ['dress-black', 'Black crepe midi', 158], ['dress-navy', 'Navy shirt dress', 136], ['dress-sage', 'Sage linen midi', 148], ['dress-red', 'Crimson wrap dress', 164], ['dress-cream', 'Cream slip dress', 152]],
  denim: [['jeans', 'Indigo selvedge jeans', 118], ['jeans-black', 'Black straight jeans', 112], ['jeans-light', 'Light wash jeans', 108], ['jeans-ecru', 'Ecru undyed jeans', 114], ['jeans-grey', 'Washed grey jeans', 116], ['jeans-white', 'White straight jeans', 112]],
  trousers: [['chinos', 'Sand chinos', 96], ['pants-charcoal', 'Charcoal wool trouser', 136], ['pants-olive', 'Olive cargo pant', 104], ['pants-cream', 'Cream pleated trouser', 124], ['pants-navy', 'Navy pleated trouser', 128], ['pants-rust', 'Rust corduroy trouser', 118]],
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
for (const outer of [null, ...jackets]) {
  for (const top of [null, ...tops]) {
    for (const bottom of top?.whole ? [null] : [null, ...bottoms]) {
      const id = lookId(top, bottom, outer);
      if ((top || bottom || outer) && !LOOKS.has(id)) LOOKS.set(id, { top, bottom, outer });
    }
  }
}
