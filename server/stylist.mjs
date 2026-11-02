// Margot, the stylist. Muse Spark is given the whole wardrobe in words (the base set, read once by Spark from its
// pictures, and each store garment as Spark read it when it was added), what is on the mannequin and the conversation so
// far. It answers in a sentence or two and, when it suggests an outfit, names it by the catalogue's ids, so it can only
// pick what exists. It also judges what the shopper put together: whether the pieces go, and what to swap if not.
import { existsSync, readFileSync } from 'node:fs';
import { KINDS, LOOKS, MAN, UNDER, WARDROBE, lookId, plainLook } from '../src/wardrobe.js';
import { MOCK, ask } from './meta.mjs';
import { allowance, readBody } from './muse.mjs';
import { saved } from './looks.mjs';

const NOTES = 'src/catalogue-notes.json';
const PLACES = {
  fitting: 'a quiet fitting room, neutral and simple',
  boutique: 'a warm boutique, daytime shopping',
  atelier: 'a tailor\'s atelier, crafted and smart',
  courtyard: 'a sunlit stone courtyard, outdoors by day',
  penthouse: 'a city penthouse at blue hour, evening',
};
const NONE = 'none';
const KEEP = 'keep';
const TURNS = 10; // The conversation Spark sees: enough to follow a thread, short enough to stay cheap.

// A message is a fraction of a cent; the caps only keep a public link from being used as a free chatbot.
const asks = allowance('.stylist-counts.json', Number(process.env.STYLIST_DAILY_LIMIT ?? 300), Number(process.env.STYLIST_VISITOR_LIMIT ?? 60), {
  everyone: 'I have seen everyone I can for today. The wardrobe is all yours.',
  visitor: 'That is all from me for today. The wardrobe is all yours.',
});

const notes = existsSync(NOTES) ? JSON.parse(readFileSync(NOTES, 'utf8')) : {};
const kindOf = (item) => KINDS.find((kind) => kind.id === item.category).label.toLowerCase();

function line(item) {
  const read = item.store ? item : notes[item.id] ?? {};
  const words = [read.colour, read.material, read.description].filter(Boolean).join('; ');
  return `${item.id} | ${kindOf(item)} | ${item.name} | $${item.price}${item.store ? ' | new in' : ''}${words ? ` | ${words}` : ''}`;
}

const pieces = ({ top, bottom, outer }) => [outer && `jacket ${outer.id}`, top && `top ${top.id}`, bottom && `bottom ${bottom.id}`].filter(Boolean).join(', ');

/** Whole outfits already photographed on this mannequin: changing into one costs nothing, so the stylist leans on them. */
function photographed(figure) {
  return Object.entries(saved())
    .filter(([id, views]) => views.length === 4 && id.startsWith(MAN) === Boolean(figure) && plainLook(id) !== 'bare')
    .map(([id]) => LOOKS.get(plainLook(id)))
    .filter((look) => look && (look.top?.whole || (look.top && look.bottom)));
}

function prompt(words, figure, current) {
  const ready = photographed(figure);
  return [
    'You are the in-store stylist of a premium clothing brand. Pick one complete outfit from the catalogue below for the shopper, and the room to show it in.',
    `The outfit is for the ${figure ? 'man' : 'woman'}'s mannequin.${figure ? ' The man does not wear dresses.' : ''} White leather sneakers are always included.`,
    'An outfit is either a dress, or a top (tee or shirt) with a bottom (denim or trousers). A jacket or coat over it is optional; it is worn open. A dress takes no bottom.',
    'Use only ids from the catalogue. Garments marked "new in" just arrived; suggest one when it suits.',
    'note: one or two sentences to the shopper, under 30 words, saying why these pieces work for what they asked. Warm and specific, no greeting, no exclamation marks, never mention prices or ids.',
    '',
    'Catalogue (id | kind | name | price | colour; material; description):',
    ...WARDROBE.map(line),
    '',
    `Rooms: ${Object.entries(PLACES).map(([id, text]) => `${id} (${text})`).join('; ')}.`,
    ready.length ? `Outfits already photographed, which show at once (prefer one if it suits just as well): ${ready.map((look) => `[${pieces(look)}]`).join(' ')}.` : '',
    current ? `On the mannequin now: ${current}.` : '',
    '',
    `The shopper says: "${words}"`,
  ].filter((part) => part !== '').join('\n');
}

function schema(figure) {
  const ids = (slot) => [NONE, ...WARDROBE.filter((item) => item.slot === slot && !(figure && item.whole)).map((item) => item.id)];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['top', 'bottom', 'outer', 'place', 'note'],
    properties: {
      top: { type: 'string', enum: ids('top') },
      bottom: { type: 'string', enum: ids('bottom') },
      outer: { type: 'string', enum: ids('outer') },
      place: { type: 'string', enum: Object.keys(PLACES) },
      note: { type: 'string' },
    },
  };
}

/** Without the API: a photographed outfit, chosen by the words, so the page can be tried without spending. */
async function mock(words, figure) {
  await new Promise((done) => setTimeout(done, 1400));
  const ready = photographed(figure);
  const pick = ready[[...words].reduce((sum, char) => sum + char.charCodeAt(0), 0) % ready.length];
  return {
    top: pick.top?.id ?? NONE,
    bottom: pick.bottom?.id ?? NONE,
    outer: pick.outer?.id ?? NONE,
    place: /night|dinner|evening|date/i.test(words) ? 'penthouse' : /sun|park|lunch|weekend/i.test(words) ? 'courtyard' : 'boutique',
    note: 'Easy pieces that hold together from morning to night, with one layer to take off when the room warms up.',
  };
}

const find = (id) => (id === NONE ? null : WARDROBE.find((item) => item.id === id) ?? null);

export async function stylist(request, response) {
  const reply = (status, body) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });
  const visitor = request.socket.remoteAddress ?? 'unknown';
  let reserved = false;
  try {
    const body = JSON.parse(await readBody(request, 4096));
    const words = String(body.ask ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const figure = body.figure === MAN ? MAN : '';
    if (words.length < 2) return reply(400, { error: 'Tell the stylist a little more.' });
    const blocked = asks.reserve(visitor);
    if (blocked) return reply(429, { error: blocked });
    reserved = true;
    const current = LOOKS.get(plainLook(String(body.look ?? '')));
    const answer = MOCK ? await mock(words, figure) : await ask(prompt(words, figure, current && pieces(current)), 'outfit', schema(figure), 'stylist');
    let top = find(answer.top);
    let bottom = find(answer.bottom);
    const outer = find(answer.outer);
    if (top?.whole) bottom = null;
    if (outer && !top) top = UNDER;
    if (!top || (!top.whole && !bottom)) return reply(422, { error: 'The stylist could not put a whole look together. Try saying it another way.' });
    return reply(200, { look: figure + lookId(top, bottom, outer), place: answer.place, note: answer.note.trim(), mock: MOCK });
  } catch (error) {
    console.error('stylist failed', error.status, error.message);
    if (reserved) asks.release(visitor);
    return reply(error.status === 413 ? 413 : 502, { error: 'The stylist is busy. Try again in a moment.' });
  }
}
