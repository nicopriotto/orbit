// Pin, the stylist. Muse Spark is given the whole wardrobe in words (the base set, read once by Spark from its
// pictures, and each store garment as Spark read it when it was added), what is on the mannequin and the conversation so
// far. It answers in a sentence or two and, when it suggests an outfit, names it by the catalogue's ids, so it can only
// pick what exists. It also judges what the shopper put together: whether the pieces go, and what to swap if not.
import { existsSync, readFileSync } from 'node:fs';
import { KINDS, LOOKS, MAN, SHOES, UNDER, WARDROBE, lookId, plainLook } from '../src/wardrobe.js';
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

const named = ({ top, bottom, outer, shoes }) => [outer && `${outer.name} (${outer.id}) worn open`, top && `${top.name} (${top.id})`, bottom && `${bottom.name} (${bottom.id})`, shoes && `${shoes.name} (${shoes.id})`].filter(Boolean).join(', ');

/** Pieces cut for a woman's figure: Pin leaves them off the man's mannequin unless the shopper asks for them. */
const cutForHer = (item) => Boolean(item) && (item.category === 'dresses' || item.category === 'skirts' || item.id === 'blouse-lace');

/** Whole outfits already photographed on this mannequin: changing into one costs nothing, so the stylist leans on them. */
function photographed(figure) {
  return Object.entries(saved())
    .filter(([id, views]) => views.length === 4 && id.startsWith(MAN) === Boolean(figure) && plainLook(id) !== 'bare')
    .map(([id]) => LOOKS.get(plainLook(id)))
    .filter((look) => look && (look.top?.whole || (look.top && look.bottom)))
    .filter((look) => !figure || ![look.top, look.bottom, look.outer].some(cutForHer));
}

const RULES = `How garments go together, which you check whenever an outfit is on the table:
- An outfit is a dress, or a top (tee, shirt or knit) with a bottom (denim, trousers or a skirt), and a pair of shoes. A jacket or coat over it is optional and is always worn open, so what is under it shows and has to work with it.
- Dress each mannequin the way most people with that figure would dress for the occasion: on the man's, no dresses, skirts or pieces cut for a bust. Anyone may still ask for anything, and then you go along with it.
- A dress takes no trousers or jeans under it. A dress can take a jacket or coat over it.
- Layering only makes sense when the inner layer stays visible or adds something: a tee or shirt under an open jacket is fine. Something closed and covering, like a buttoned coat over a dress of the same length, hides what is under it.
- Judge colour (tones that clash or that disappear into each other), formality (a tailored wool trouser with a heavyweight tee reads deliberate; a peacoat over a slip dress needs a reason) and season (linen and wool, light and heavy).
- Shoes finish the look: pick them for the occasion and the season. The white leather sneakers are the easy default.`;

function prompt(figure, current, turns) {
  const ready = photographed(figure);
  return [
    'You are Pin, the in-store stylist of a premium clothing brand: a tailor\'s dress form with a pincushion for a hat and a measuring tape for a scarf, who has dressed more mannequins than anyone. You may joke about pins, seams or being a dress form, rarely and lightly. You speak to the shopper in the wardrobe of its virtual fitting room, where a mannequin wears what is chosen. Warm, precise, a little dry; never gushing. Answer in the language the shopper writes in.',
    '',
    RULES,
    '',
    'Each answer:',
    '- reply: one to three short sentences, under 45 words. No greeting after the first turn, no exclamation marks, no lists, never prices or ids.',
    '- If they ask for something to wear, or a look would answer them better than words, choose one complete outfit from the catalogue: action "dress", with top, bottom and outer (or "none"), shoes, and a room, and say in reply why it works for them.',
    '- If they ask what you think of what is on, say honestly whether the pieces go together and why, using the rules. If one piece is wrong, say which and what you would put instead, and dress the mannequin in that fix with action "dress".',
    '- Otherwise, or if you need to ask something first, action "none".',
    '- place: the room that suits the outfit, or "keep" to leave it.',
    '- Garments marked "new in" just arrived; suggest one when it suits.',
    ready.length ? `- Outfits already photographed show at once; prefer one when it suits as well: ${ready.map((look) => `[${named(look)}]`).join(' ')}.` : '',
    '',
    'Catalogue (id | kind | name | price | colour; material; description):',
    ...WARDROBE.map(line),
    '',
    `Rooms: ${Object.entries(PLACES).map(([id, text]) => `${id} (${text})`).join('; ')}.`,
    '',
    `The mannequin is ${figure ? 'the man\'s' : 'the woman\'s'}. Pieces cut for a woman's figure: ${WARDROBE.filter(cutForHer).map((item) => item.id).join(', ')}.`,
    `On the mannequin now: ${current ? named(current) : 'nothing yet'}.`,
    '',
    'The conversation so far:',
    ...turns.map((turn) => `${turn.role === 'stylist' ? 'Pin' : 'Shopper'}: ${turn.text}`),
  ].filter((part) => part !== '').join('\n');
}

function schema() {
  const ids = (slot) => [NONE, ...WARDROBE.filter((item) => item.slot === slot).map((item) => item.id)];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'action', 'top', 'bottom', 'outer', 'shoes', 'place'],
    properties: {
      reply: { type: 'string' },
      action: { type: 'string', enum: ['dress', 'none'] },
      top: { type: 'string', enum: ids('top') },
      bottom: { type: 'string', enum: ids('bottom') },
      outer: { type: 'string', enum: ids('outer') },
      shoes: { type: 'string', enum: ids('shoes') },
      place: { type: 'string', enum: [KEEP, ...Object.keys(PLACES)] },
    },
  };
}

/** Without the API: a photographed outfit chosen by the words, or a fixed opinion, so the page can be tried for free. */
async function mock(words, figure, current) {
  await new Promise((done) => setTimeout(done, 1400));
  if (/think|work|go together|look ok|opinion|how does/i.test(words)) {
    return { reply: current ? 'The jacket earns its place over the tee, and the sand keeps it light. I would leave it exactly as it is.' : 'Put something on first and I will tell you straight.', action: 'none', top: NONE, bottom: NONE, outer: NONE, shoes: NONE, place: KEEP };
  }
  const ready = photographed(figure);
  const pick = ready[[...words].reduce((sum, char) => sum + char.charCodeAt(0), 0) % ready.length];
  return {
    reply: 'Easy pieces that hold together from morning to night. Try this, then tell me what you would change.',
    action: 'dress',
    top: pick.top?.id ?? NONE,
    bottom: pick.bottom?.id ?? NONE,
    outer: pick.outer?.id ?? NONE,
    shoes: pick.shoes?.id ?? NONE,
    place: /night|dinner|evening|date/i.test(words) ? 'penthouse' : /sun|park|lunch|weekend/i.test(words) ? 'courtyard' : KEEP,
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
    const body = JSON.parse(await readBody(request, 16 * 1024));
    const turns = (Array.isArray(body.messages) ? body.messages : [])
      .slice(-TURNS)
      .map((turn) => ({ role: turn?.role === 'stylist' ? 'stylist' : 'shopper', text: String(turn?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) }))
      .filter((turn) => turn.text);
    const last = turns.at(-1);
    if (!last || last.role !== 'shopper' || last.text.length < 2) return reply(400, { error: 'Tell me a little more.' });
    const figure = body.figure === MAN ? MAN : '';
    const blocked = asks.reserve(visitor);
    if (blocked) return reply(429, { error: blocked });
    reserved = true;
    const current = LOOKS.get(plainLook(String(body.look ?? '')));
    const answer = MOCK ? await mock(last.text, figure, current) : await ask(prompt(figure, current, turns), 'stylist', schema(), 'stylist');
    const out = { reply: answer.reply.trim(), place: answer.place === KEEP ? null : answer.place, mock: MOCK };
    if (answer.action === 'dress') {
      let top = find(answer.top);
      let bottom = find(answer.bottom);
      const outer = find(answer.outer);
      if (top?.whole) bottom = null;
      if (outer && !top) top = UNDER;
      if (top && (top.whole || bottom)) out.look = figure + lookId(top, bottom, outer, find(answer.shoes) ?? SHOES);
    }
    return reply(200, out);
  } catch (error) {
    console.error('stylist failed', error.status, error.message);
    if (reserved) asks.release(visitor);
    return reply(error.status === 413 ? 413 : 502, { error: 'I lost my train of thought. Ask me again in a moment.' });
  }
}
