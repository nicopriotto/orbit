import { KEEP, dropPrint, keepPrint, loadPrints } from './album.js';
import { APP_NAME, makePrint } from './print.js';
import { KINDS, LOOKS, MAN, UNDER, WARDROBE, lookId, plainLook, setStoreItems } from './wardrobe.js';
import './atelier.js';

// The store's own garments join the catalogue before anything is drawn. Without the API the base catalogue is enough.
setStoreItems(await fetch('api/catalog').then((response) => (response.ok ? response.json() : [])).catch(() => []));

// Zoom crops each photo from the bottom, far enough that the wall meets the floor behind the stand, not under it.
const PLACES = [
  { id: 'fitting', name: 'Fitting room', shade: 0.5, zoom: 1.36 },
  { id: 'boutique', name: 'The boutique', shade: 0.34, zoom: 1.1 },
  { id: 'atelier', name: 'The atelier', shade: 0.5, zoom: 1 },
  { id: 'courtyard', name: 'The courtyard', shade: 0.5, zoom: 1.15 },
  { id: 'penthouse', name: 'Blue hour', shade: 0.7, zoom: 1 },
];

// One full turn in degrees, with the figure turning towards the viewer's left as the angle grows. The second half reuses
// the first mirrored, since a figure's two sides match.
const STOPS = [
  { at: 0, view: 'front' },
  { at: 45, view: 'front34' },
  { at: 90, view: 'side' },
  { at: 180, view: 'back' },
  { at: 270, view: 'side', mirror: true },
  { at: 315, view: 'front34', mirror: true },
  { at: 360, view: 'front' },
];
const VIEWS = ['front', 'front34', 'side', 'back'];
const TURN_MS = 1200; // A half turn: long enough to read as rotation, short enough not to wait for.
const SHORTEST_TURN_MS = 640;
const SQUEEZE = 0.14; // How far the body narrows at the middle of a quarter turn, the one thing that reads as depth between two still views.
const BLUR = 3; // Pixels at that same moment, so the two views merge rather than show as a double exposure.
const CHANGE_OUT_MS = 170; // The look on the figure leaves first, so two are never on show together.
const CHANGE_IN_MS = 420;
const PLATE_FADE_MS = 420;
const MUSE_SECONDS = 30; // One image usually takes 18 to 37 seconds. It sets the pace of the loader, which never shows a number.
const STEPS = ['Measuring twice', 'Cutting the pattern', 'Pinning the hem', 'Sewing the seams', 'Pressing it flat', 'One last stitch'];
const STEP_SECONDS = 5;
const FINISH_MS = 420; // Once Muse answers, the loader runs out to the end this fast.
const REVEAL_MS = 1200; // The person rising out of the mannequin: the one moment here worth taking its time.
const HISTORY = 20;
const FIRST_LOOK = 'jacket-chinos'; // Already saved, so the first visit spends nothing and Try it on me works from the start.
const STORE = import.meta.env.VITE_STORE_URL; // The brand's cart. It receives the look's pieces as ?items=a,b,c.
// A phone only has the gap between the name and Back/Forward for it, so it says less there.
const BACK_WAIT = matchMedia('(max-width: 600px)').matches ? 'Making the back' : 'Muse is making the back';
const BACK_FAILED = matchMedia('(max-width: 600px)').matches ? 'No back this time' : 'The back did not come through';

const $ = (id) => document.getElementById(id);
const state = { top: null, bottom: null, outer: null };
const frames = [$('frame-a'), $('frame-b')];
const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = (value) => `$${value}`;
const SNEAKERS = { name: 'White leather sneakers', file: 'sneakers', image: 'studio/set/item-sneakers.webp' };

let wearer = null; // Set while the visitor's own images replace the mannequin: { look, front, back }.
let shown = FIRST_LOOK; // The look on the mannequin, which trails the choice while Muse dresses it.
let dressing = 0; // Identifies the latest change of clothes, so an older answer from Muse is ignored.
let figure = ''; // Which mannequin: nothing for hers, MAN for his.
let saved = { bare: VIEWS, [`${MAN}bare`]: VIEWS, [FIRST_LOOK]: VIEWS }; // Finished views per look, as listed by the server.

const chosen = () => figure + lookId(state.top, state.bottom, state.outer);
const undressed = () => !state.top && !state.bottom && !state.outer;
const worn = (item) => state[item.slot] === item;
const picture = (look, view) => `api/looks/${look}-${view}.webp`;

function source(look, view) {
  if (wearer) return view === 'back' ? wearer.back ?? wearer.front : wearer.front;
  return picture(look, view);
}

const load = (url) => {
  const image = new Image();
  image.src = url;
  return image.decode().catch(() => {});
};

/* The look */

/** A jacket goes on over the plain tee unless something else is there. The tee is sold and comes off like any other piece. */
function underJacket() {
  if (state.outer && !state.top) state.top = UNDER;
}

function toggle(item) {
  remember();
  leaveWearer();
  if (worn(item)) state[item.slot] = null;
  else {
    state[item.slot] = item;
    if (item.whole) state.bottom = null;
    if (item.slot === 'bottom' && state.top?.whole) state.top = null;
    underJacket();
  }
  renderLook();
  dress();
}

function notice(text) {
  $('working-text').textContent = text;
  $('working').hidden = !text;
}

/** Says something for a moment, then gives the line back to whatever it was showing. */
function flash(text) {
  notice(text);
  setTimeout(() => {
    if ($('working-text').textContent === text) notice('');
    syncTurn();
  }, 5000);
}

function showProgress(share) {
  $('loader-done').style.strokeDashoffset = 1 - share;
  $('loader-needle').style.transform = `rotate(${share * 360}deg)`;
}

let waiting = null;

/** Muse gives no progress of its own, so this slows as it climbs and never quite arrives. Only an answer finishes it. */
function wait(seconds, steps = STEPS) {
  clearInterval(waiting);
  const start = performance.now();
  const tick = () => {
    const elapsed = (performance.now() - start) / 1000;
    $('loader-step').textContent = steps[Math.min(Math.floor(elapsed / STEP_SECONDS), steps.length - 1)];
    showProgress(0.94 * (1 - Math.exp((-2.2 * elapsed) / seconds)));
  };
  notice('');
  delete $('loader').dataset.finishing;
  showProgress(0);
  document.body.toggleAttribute('data-working', true);
  $('loader').hidden = false;
  tick();
  waiting = setInterval(tick, 250);
}

async function finishWaiting() {
  if (!waiting) return;
  clearInterval(waiting);
  $('loader').dataset.finishing = '';
  showProgress(1);
  await new Promise((done) => setTimeout(done, FINISH_MS));
}

function stopWaiting() {
  clearInterval(waiting);
  waiting = null;
  document.body.removeAttribute('data-working');
  $('loader').hidden = true;
}

function lockTurn(locked) {
  $('wardrobe').toggleAttribute('data-locked', locked);
  $('try').disabled = locked || undressed();
  syncTurn();
}

/** A try-on arrives front first, so until its back exists there is nothing to turn to. */
function syncTurn() {
  const locked = $('wardrobe').hasAttribute('data-locked') || Boolean(wearer && !wearer.back);
  for (const id of ['turn-left', 'turn-right']) $(id).disabled = locked;
  const note = !wearer || wearer.back ? '' : wearer.failed ? BACK_FAILED : BACK_WAIT;
  if (note || [BACK_WAIT, BACK_FAILED].includes($('working-text').textContent)) notice(note);
}

async function requestLook(look) {
  const response = await fetch('api/looks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ look }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  saved[look] = VIEWS;
}

let changing = 0;

/** Only one look is ever on the figure: this one fades away, the pictures change while nothing shows, and the next one arrives. */
async function change(apply) {
  const turn = ++changing;
  const body = $('body');
  if (!motion) {
    apply();
    return;
  }
  const opacity = getComputedStyle(body).opacity;
  const running = body.getAnimations();
  const out = body.animate([{ opacity }, { opacity: 0, filter: 'blur(6px)' }], { duration: CHANGE_OUT_MS, easing: 'ease-in-out', fill: 'forwards' });
  running.forEach((animation) => animation.cancel());
  await out.finished.catch(() => {});
  if (turn !== changing) return;
  apply();
  await Promise.all(frames.map((image) => image.decode().catch(() => {})));
  if (turn !== changing) return;
  body.animate([
    { opacity: 0, filter: 'blur(10px)', scale: '0.97', translate: '0 1.2%' },
    { opacity: 1, filter: 'blur(0)', scale: '1', translate: '0 0' },
  ], { duration: CHANGE_IN_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  out.cancel();
}

function changeInto(look) {
  const repaint = () => {
    shown = look;
    drawn = '';
    draw();
  };
  if (look === shown) repaint();
  else change(repaint);
}

const facing = () => STOPS.reduce((best, stop) => (Math.abs(wrap(angle) - stop.at) < Math.abs(wrap(angle) - best.at) ? stop : best)).view;

/** A saved look changes at once. A new one is painted once by Muse, every view together, then stays on the server for everyone. */
async function dress() {
  const look = chosen();
  const turn = ++dressing;
  if (saved[look]?.length !== VIEWS.length) {
    lockTurn(true);
    wait(MUSE_SECONDS);
    try {
      await requestLook(look);
    } catch (error) {
      if (turn === dressing) refuse(error);
      return;
    }
  }
  await load(picture(look, facing()));
  VIEWS.forEach((view) => load(picture(look, view)));
  if (turn !== dressing) return;
  await finishWaiting();
  if (turn !== dressing) return;
  changeInto(look); // First, while the figure is still dimmed, so it leaves from there.
  stopWaiting();
  lockTurn(false);
  label();
}

/** The mannequin is still in the last look that worked, so the choice falls back to match it. */
function refuse(error) {
  history.pop();
  syncDock();
  wearLook(shown);
  renderLook();
  stopWaiting();
  lockTurn(false);
  flash(error.message);
}

const covered = ({ top, bottom }) => top?.whole || (bottom && top);

/** Surprise deals only from whole outfits already saved, so it never spends anything or leaves the figure half dressed. */
function surprise() {
  remember();
  leaveWearer();
  const options = Object.keys(saved).filter((look) => look.startsWith(MAN) === Boolean(figure) && covered(LOOKS.get(plainLook(look)) ?? {}) && saved[look].length === VIEWS.length && look !== chosen());
  if (!options.length) {
    history.pop();
    syncDock();
    flash('No saved looks for this mannequin yet');
    return;
  }
  wearLook(options[Math.floor(Math.random() * options.length)]);
  renderLook();
  dress();
}

/* Pin, the stylist: a dress form with a pincushion for a hat. Muse Spark speaks for it: it can dress the mannequin, pick the room, and say whether what the
   shopper put together works. The conversation lives in this page only. */

const stylist = $('stylist');
const thread = $('stylist-thread');
const talk = $('stylist-form');
const GREETING = 'Tell me where you are going and I will put a look together. Or dress the mannequin yourself and ask what I think.';
const conversation = [{ role: 'stylist', text: GREETING }];
let asking = 0;

function said(text, { you, quiet, look } = {}) {
  const bubble = document.createElement('p');
  bubble.className = 'said';
  bubble.toggleAttribute('data-you', Boolean(you));
  bubble.toggleAttribute('data-quiet', Boolean(quiet));
  bubble.textContent = text;
  if (look) {
    const row = document.createElement('span');
    row.className = 'said-look';
    const { top, bottom, outer } = LOOKS.get(plainLook(look)) ?? {};
    for (const item of [outer, top, bottom, SNEAKERS].filter(Boolean)) {
      const image = document.createElement('img');
      image.src = item.image;
      image.alt = item.name;
      image.title = item.name;
      row.append(image);
    }
    bubble.append(row);
  }
  thread.append(bubble);
  if (motion) bubble.animate([{ opacity: 0, transform: 'translateY(6px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  thread.scrollTo({ top: thread.scrollHeight, behavior: motion ? 'smooth' : 'auto' });
  return bubble;
}

function typing() {
  const bubble = said('', { quiet: true });
  bubble.innerHTML = '<span class="typing" aria-label="Pin is thinking"><i></i><i></i><i></i></span>';
  return bubble;
}

function syncTalk() {
  $('stylist-go').disabled = talk.ask.value.trim().length < 2 || stylist.hasAttribute('data-thinking');
}

async function askPin(words) {
  if (words.length < 2 || stylist.hasAttribute('data-thinking')) return;
  const ticket = ++asking;
  said(words, { you: true });
  conversation.push({ role: 'shopper', text: words });
  talk.ask.value = '';
  // After the first question only the one about the look on the mannequin stays: it is always worth asking.
  for (const chip of $('stylist-chips').querySelectorAll('button')) chip.hidden = !/think/i.test(chip.dataset.ask);
  stylist.toggleAttribute('data-thinking', true);
  syncTalk();
  const dots = typing();
  try {
    const response = await fetch('api/stylist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation, figure, look: undressed() ? '' : chosen() }),
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(answer.error);
    if (ticket !== asking) return;
    dots.remove();
    const look = answer.look && LOOKS.has(plainLook(answer.look)) ? answer.look : null;
    said(answer.reply, { look });
    conversation.push({ role: 'stylist', text: answer.reply });
    if (look && (look !== chosen() || wearer)) {
      remember();
      leaveWearer();
      wearLook(look);
      renderLook();
      dress();
    }
    const place = PLACES.find((entry) => entry.id === answer.place);
    if (place && place !== room) setPlace(place);
  } catch (error) {
    if (ticket !== asking) return;
    dots.remove();
    said(error.message || 'I lost my train of thought. Ask me again in a moment.', { quiet: true });
    conversation.pop();
  } finally {
    if (ticket === asking) {
      stylist.removeAttribute('data-thinking');
      syncTalk();
    }
  }
}

said(GREETING);
talk.ask.addEventListener('input', syncTalk);
talk.addEventListener('submit', (event) => {
  event.preventDefault();
  askPin(talk.ask.value.trim());
});
for (const chip of $('stylist-chips').querySelectorAll('button')) chip.addEventListener('click', () => askPin(chip.dataset.ask));

// Its portrait waits at the foot of the wardrobe once the card has scrolled out of sight.
new IntersectionObserver(([entry]) => $('stylist-call').toggleAttribute('data-on', !entry.isIntersecting && $('wardrobe').scrollTop > 0), { root: $('wardrobe'), rootMargin: '-120px 0px 0px 0px' }).observe(stylist);
$('stylist-call').hidden = false;
$('stylist-call').addEventListener('click', () => {
  $('wardrobe').scrollTo({ top: 0, behavior: motion ? 'smooth' : 'auto' });
  talk.ask.focus({ preventScroll: true });
});

function wearLook(look) {
  figure = look.startsWith(MAN) ? MAN : '';
  const { top = null, bottom = null, outer = null } = LOOKS.get(plainLook(look)) ?? {};
  Object.assign(state, { top, bottom, outer });
}

function renderLook() {
  const { top, bottom, outer } = state;
  const names = [outer?.name, top?.name, bottom?.name].filter(Boolean);
  if (names.length) names.push(SNEAKERS.name);
  $('pieces').textContent = names.length ? names.join(' · ') : 'Open the wardrobe to pick a piece';
  $('total').textContent = names.length ? money((top?.price ?? 0) + (bottom?.price ?? 0) + (outer?.price ?? 0)) : '';
  $('try').disabled = !names.length;
  $('try').classList.toggle('primary', Boolean(names.length));
  $('look-toggle').disabled = !names.length;
  if (!names.length) unfoldLook(false);
  renderWorn();
  syncDock();
  label();
}

function showStorePane(done) {
  $('store-cart').hidden = done;
  $('store-done').hidden = !done;
}

function shop() {
  $('store-list').replaceChildren(...lookRows());
  $('store-total').textContent = $('total').textContent;
  $('store-demo').hidden = Boolean(STORE);
  showStorePane(false);
  $('store').showModal();
}

/** Without a store behind it, the demo says what would happen rather than open a page that isn't there. */
function checkout() {
  if (!STORE) return showStorePane(true);
  const items = [state.outer, state.top, state.bottom].filter(Boolean).map((item) => item.id);
  open(`${STORE}?items=${items.join(',')}`, '_blank', 'noopener');
}

$('shop').addEventListener('click', shop);
$('shop-worn').addEventListener('click', shop);
$('shop-bag').addEventListener('click', shop);
$('store-checkout').addEventListener('click', checkout);
for (const id of ['store-close', 'store-back']) $(id).addEventListener('click', () => $('store').close());
$('store').addEventListener('click', (e) => {
  if (e.target === $('store')) $('store').close();
});

function wornRow({ name, image, price }, item) {
  const row = document.createElement('li');
  row.innerHTML = `
    <img src="${image}" alt="" draggable="false" />
    <b>${name}</b>
    <i>${price ? money(price) : 'Included'}</i>`;
  if (item) {
    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'round';
    off.setAttribute('aria-label', `Take off ${name}`);
    off.innerHTML = TAKE_OFF;
    off.addEventListener('click', () => {
      if (!$('wardrobe').hasAttribute('data-locked')) toggle(item);
    });
    row.append(off);
  }
  return row;
}

/** Everything on the figure, the pieces that come with the look included. */
function lookRows(removable) {
  const { top, bottom, outer } = state;
  const pieces = [outer, top, bottom].filter(Boolean).map((item) => wornRow(item, removable && item));
  if (pieces.length) pieces.push(wornRow(SNEAKERS));
  return pieces;
}

function renderWorn() {
  $('worn').replaceChildren(...lookRows(true));
  for (const button of document.querySelectorAll('[data-figure]')) button.setAttribute('aria-pressed', String(button.dataset.figure === figure));
}

/** Each mannequin keeps what it had on. Changing one never spends: a new look is only made when a piece is picked. */
function setFigure(next) {
  if (next === figure || $('wardrobe').hasAttribute('data-locked')) return;
  remember();
  leaveWearer();
  figure = next;
  renderLook();
  dress();
}

for (const button of document.querySelectorAll('[data-figure]')) button.addEventListener('click', () => setFigure(button.dataset.figure));

function unfoldLook(open) {
  $('tag').toggleAttribute('data-open', open);
  $('worn').inert = !open;
  $('look-toggle').setAttribute('aria-expanded', String(open));
}

$('look-toggle').addEventListener('click', () => unfoldLook(!$('tag').hasAttribute('data-open')));

/* The turn */

let angle = 0;
let tween = null;
let drawn = '';

const smoothstep = (t) => t * t * (3 - 2 * t);
const wrap = (degrees) => ((degrees % 360) + 360) % 360;

/** Neighbouring views swap near the middle of each span. A wide gap swaps almost instantly, or both views would show as a double exposure. */
function draw() {
  const wrapped = wrap(angle);
  const span = STOPS.findIndex((stop, i) => wrapped < STOPS[i + 1].at);
  const from = STOPS[span];
  const to = STOPS[span + 1];
  const progress = (wrapped - from.at) / (to.at - from.at);
  const fade = to.at - from.at > 45 ? 0.3 : 0.6;
  const mix = smoothstep(Math.min(Math.max((progress - 0.5 + fade / 2) / fade, 0), 1));
  const key = `${shown}${span}${mix.toFixed(3)}`;
  if (key === drawn) return;
  drawn = key;
  const paint = (image, stop, opacity) => {
    const src = source(shown, wearer && stop.at > 90 && stop.at < 270 ? 'back' : stop.view);
    if (image.getAttribute('src') !== src) image.src = src;
    image.style.opacity = opacity;
    image.style.transform = stop.mirror && !wearer ? 'scaleX(-1)' : '';
  };
  // The new view comes in over the old one, which only then lets go, so neither the body nor its edges pop.
  paint(frames[0], from, Math.min(2 * (1 - mix), 1));
  paint(frames[1], to, Math.min(2 * mix, 1));
}

function turnTo(target) {
  if (!motion) {
    angle = target;
    return;
  }
  const length = Math.max((Math.abs(target - angle) / 180) * TURN_MS, SHORTEST_TURN_MS);
  tween = { from: angle, to: target, start: performance.now(), length, reach: Math.min(Math.abs(target - angle) / 90, 1) };
}

let spin = 0;

/** A soft narrowing with a little blur at the middle of a turn. It eases toward its target, so an interrupted turn doesn't jump. */
function lean(dt, target) {
  spin += (target - spin) * Math.min(dt * 16, 1);
  if (spin < 0.002 && !target) spin = 0;
  $('body').style.transform = spin ? `scaleX(${(1 - SQUEEZE * spin).toFixed(4)})` : '';
  $('body').style.filter = spin > 0.02 ? `blur(${(BLUR * spin).toFixed(2)}px)` : '';
}

/** The next angle that has a picture. The visitor's own photos only exist from the front and the back. */
function step(direction) {
  const stops = wearer ? [0, 180] : STOPS.slice(0, -1).map((stop) => stop.at);
  const goal = tween?.to ?? angle;
  const nearest = stops.reduce((best, at, i) => (Math.abs(((wrap(goal) - at + 540) % 360) - 180) < Math.abs(((wrap(goal) - stops[best] + 540) % 360) - 180) ? i : best), 0);
  const next = stops[(nearest + direction + stops.length) % stops.length];
  turnTo(goal + direction * wrap(direction * (next - stops[nearest])));
  syncPrint();
}

$('turn-left').addEventListener('click', () => step(1));
$('turn-right').addEventListener('click', () => step(-1));
addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.target.closest?.('.wardrobe') || $('turn-left').disabled) return;
  if (e.key === 'ArrowLeft') step(1);
  if (e.key === 'ArrowRight') step(-1);
});

/* The wardrobe */

const spots = [];

function label() {
  for (const { item, button, note } of spots) {
    button.setAttribute('aria-pressed', String(worn(item)));
    note.textContent = worn(item) ? 'Wearing' : '';
  }
}

function createSpot(item) {
  const spot = document.createElement('div');
  spot.className = 'spot';
  spot.style.setProperty('--h', item.length);
  spot.dataset.slot = item.slot;
  spot.innerHTML = `
    <button type="button" class="piece" aria-pressed="false" aria-label="${item.name}, ${money(item.price)}">
      <svg class="hanger" aria-hidden="true"><use href="#${item.slot === 'bottom' ? 'clips' : 'hook'}" /></svg>
      <span class="flip">
        <img src="${item.image}" alt="" draggable="false" />
        <img class="reverse" src="${item.back}" alt="" draggable="false" />
      </span>
      <b>${item.name}</b>
      <i>${money(item.price)}</i>
      <em></em>
    </button>
    <button type="button" class="round turn-over" aria-label="Turn over ${item.name}" aria-pressed="false">${TURN_OVER}</button>`;
  if (item.store) {
    // A store's own garment says so, and the store can take it out; the base catalogue stays as it is.
    spot.insertAdjacentHTML('beforeend', `<span class="store-tag">New</span><button type="button" class="round take-out" aria-label="Take ${item.name} out of the wardrobe">${BIN}</button>`);
    spot.querySelector('.take-out').addEventListener('click', () => takeOut(item));
  }
  const button = spot.querySelector('.piece');
  const over = spot.querySelector('.turn-over');
  button.addEventListener('click', () => {
    if (!$('wardrobe').hasAttribute('data-locked')) toggle(item);
  });
  const turn = (turned) => {
    spot.toggleAttribute('data-turned', turned);
    over.setAttribute('aria-pressed', String(turned));
  };
  over.addEventListener('click', () => turn(!spot.hasAttribute('data-turned')));
  spot.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') turn(false);
  });
  spots.push({ item, spot, button, note: spot.querySelector('em') });
  return spot;
}

function fitArrows(section) {
  const rail = section.querySelector('.rail');
  const room = rail.scrollWidth - rail.clientWidth;
  section.toggleAttribute('data-fits', room < 2);
  section.querySelector('[data-go="-1"]').disabled = rail.scrollLeft < 2;
  section.querySelector('[data-go="1"]').disabled = rail.scrollLeft > room - 2;
}

/** Every kind of garment keeps its own rail. The arrows only show once a kind holds more than its rail can show. */
function createSection(kind) {
  const section = document.createElement('section');
  section.className = 'section';
  section.dataset.kind = kind.id;
  section.setAttribute('aria-label', kind.label);
  section.innerHTML = `
    <div class="section-head">
      <h3>${kind.label}</h3>
      <button type="button" class="round" data-go="-1" aria-label="Previous ${kind.label}">${PREVIOUS}</button>
      <button type="button" class="round" data-go="1" aria-label="Next ${kind.label}">${NEXT}</button>
    </div>
    <div class="hanging">
      <span class="rail-bar"></span>
      <div class="rail"></div>
    </div>`;
  const rail = section.querySelector('.rail');
  rail.append(...WARDROBE.filter((item) => item.category === kind.id).map(createSpot));
  rail.addEventListener('scroll', () => fitArrows(section), { passive: true });
  for (const button of section.querySelectorAll('[data-go]')) {
    button.addEventListener('click', () => rail.scrollBy({ left: Number(button.dataset.go) * rail.clientWidth * 0.8, behavior: motion ? 'smooth' : 'auto' }));
  }
  return section;
}

const ARROW = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" /></svg>`;
const PREVIOUS = ARROW('M15 5l-7 7 7 7');
const NEXT = ARROW('M9 5l7 7-7 7');
const TAKE_OFF = ARROW('M6 6l12 12M18 6L6 18');
const BIN = ARROW('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3');
const TURN_OVER = ARROW('M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5');

$('sections').append(...KINDS.map(createSection));
const fitAll = () => document.querySelectorAll('.section').forEach(fitArrows);
addEventListener('resize', fitAll);

/* The store's garments: hung from the add-a-garment flow, and taken out again with a moment to undo */

/** Reads the catalogue again and redraws the rails. What is worn keeps its place if it is still in the catalogue. */
async function refreshWardrobe(added) {
  const entries = await fetch('api/catalog').then((response) => response.json()).catch(() => null);
  if (!entries) return;
  setStoreItems(entries);
  const same = (item) => (item ? WARDROBE.find((entry) => entry.id === item.id) ?? null : null);
  const before = chosen();
  Object.assign(state, { top: same(state.top), bottom: same(state.bottom), outer: same(state.outer) });
  spots.length = 0;
  $('sections').replaceChildren(...KINDS.map(createSection));
  requestAnimationFrame(fitAll);
  label();
  if (chosen() !== before) {
    renderLook();
    dress();
  }
  if (!added) return;
  const spot = spots.find((entry) => entry.item.id === added.id)?.spot;
  showWardrobe(true);
  const kind = KINDS.find((entry) => entry.id === added.kind);
  setTimeout(() => {
    jumpTo(kind);
    spot?.toggleAttribute('data-new', true);
  }, motion ? 480 : 0);
}

let undoGarment = null;

async function takeOut(item) {
  if (worn(item) && !$('wardrobe').hasAttribute('data-locked')) toggle(item);
  const response = await fetch(`api/catalog/${item.id}`, { method: 'DELETE' }).catch(() => null);
  if (!response?.ok) return flash('That garment could not be taken out');
  await refreshWardrobe();
  bin();
  clearTimeout(undoGarment?.timer);
  undoGarment = {
    id: item.id,
    timer: setTimeout(() => {
      undoGarment = null;
      hideToast();
    }, UNDO_MS),
  };
  $('toast-text').textContent = `${item.name} taken out`;
  showToast();
}

addEventListener('orbit:catalog', (event) => refreshWardrobe(event.detail.added));

/* Quick access: one bar that stays on top and follows the scroll, with a single mark sliding between the kinds. */

const jumps = KINDS.map((kind) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = kind.label;
  button.addEventListener('click', () => jumpTo(kind));
  $('jump').append(button);
  return { kind, button };
});
let pinned = null; // The kind just asked for: the last ones can't reach the top, so the scroll alone can't say it was picked.

function markJump(kind) {
  const { button } = jumps.find((jump) => jump.kind === kind);
  for (const jump of jumps) jump.button.toggleAttribute('data-here', jump.button === button);
  $('jump-mark').style.transform = `translateX(${button.offsetLeft}px)`;
  $('jump-mark').style.width = `${button.offsetWidth}px`;
  $('jump').scrollTo({ left: button.offsetLeft - ($('jump').clientWidth - button.offsetWidth) / 2, behavior: motion ? 'smooth' : 'auto' });
}

const kindSection = (kind) => document.querySelector(`.section[data-kind="${kind.id}"]`);

function jumpTo(kind) {
  pinned = kind;
  markJump(kind);
  const top = kindSection(kind).getBoundingClientRect().top - $('wardrobe-top').getBoundingClientRect().bottom - 12;
  $('wardrobe').scrollBy({ top, behavior: motion ? 'smooth' : 'auto' });
}

function followScroll() {
  if (pinned) return;
  const line = $('wardrobe-top').getBoundingClientRect().bottom + 60;
  const { kind } = jumps.findLast((jump) => kindSection(jump.kind).getBoundingClientRect().top <= line) ?? jumps[0];
  const atEnd = $('wardrobe').scrollTop + $('wardrobe').clientHeight >= $('wardrobe').scrollHeight - 2;
  markJump(atEnd ? jumps.at(-1).kind : kind);
}

$('wardrobe').addEventListener('scroll', followScroll, { passive: true });
for (const name of ['wheel', 'touchmove']) $('wardrobe').addEventListener(name, () => { pinned = null; }, { passive: true });

function showWardrobe(visible) {
  document.body.toggleAttribute('data-wardrobe', visible);
  for (const id of ['open-wardrobe', 'wardrobe-rail']) $(id).setAttribute('aria-expanded', String(visible));
  $('wardrobe-label').firstElementChild.textContent = visible ? 'Close the ' : 'Open the ';
  $('wardrobe').inert = !visible;
  if (visible) {
    fitAll();
    pinned = null;
    followScroll();
  }
}

$('open-wardrobe').addEventListener('click', () => showWardrobe(!document.body.hasAttribute('data-wardrobe')));
$('wardrobe-rail').addEventListener('click', () => showWardrobe(true));
$('wardrobe-close').addEventListener('click', () => showWardrobe(false));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || document.querySelector('dialog[open]') || !document.body.hasAttribute('data-wardrobe')) return;
  showWardrobe(false);
});
$('surprise').addEventListener('click', surprise);

let last = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  let bend = 0;
  if (tween) {
    const t = tween.length ? Math.min((now - tween.start) / tween.length, 1) : 1;
    angle = tween.from + (tween.to - tween.from) * smoothstep(t);
    bend = Math.sin(Math.PI * t) * tween.reach;
    if (t === 1) tween = null;
  }
  lean(dt, bend);
  draw();
  requestAnimationFrame(frame);
}

/* Places */

const plates = [$('plate-a'), $('plate-b')];
const stands = [$('stand-a'), $('stand-b')];
let plate = 0;
let placing = 0; // Only the last place asked for arrives, however quickly they are clicked.
let room = PLACES[0];

function setPlace(place) {
  const ticket = ++placing;
  room = place;
  syncPrint();
  for (const button of document.querySelectorAll('.place')) button.setAttribute('aria-pressed', String(button.dataset.place === place.id));
  $('place-name').textContent = place.name;
  const root = document.documentElement.style;
  root.setProperty('--shade', place.shade);
  const incoming = 1 - plate;
  plates[incoming].src = `studio/places/${place.id}.webp`;
  plates[incoming].style.transform = `scale(${place.zoom})`;
  stands[incoming].src = `studio/set/stand-${place.id}.webp`;
  Promise.all([plates[incoming], stands[incoming]].map((image) => image.decode().catch(() => {}))).then(() => {
    if (ticket !== placing) return;
    const outgoing = plate;
    plates[incoming].style.zIndex = 1;
    plates[outgoing].style.zIndex = 0;
    plates[incoming].dataset.on = '';
    stands[incoming].dataset.on = '';
    delete stands[outgoing].dataset.on;
    plate = incoming;
    // The old photo waits underneath until the new one covers it, or the room would dip to black halfway.
    setTimeout(() => {
      if (plate !== outgoing) delete plates[outgoing].dataset.on;
    }, PLATE_FADE_MS);
  });
}

function placeButton(place) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'place';
  button.dataset.place = place.id;
  button.setAttribute('aria-label', place.name);
  button.innerHTML = `<img src="studio/places/${place.id}-thumb.webp" alt="" />`;
  button.addEventListener('click', () => setPlace(place));
  return button;
}

for (const place of PLACES) {
  new Image().src = `studio/places/${place.id}.webp`;
  new Image().src = `studio/set/stand-${place.id}.webp`;
  $('places').append(placeButton(place));
  $('snap-places').append(placeButton(place));
}

/* Trying it on, and stepping back */

const history = []; // What was on the figure before each change, the visitor's own images included.
const future = []; // What Back stepped away from, until something new is chosen.

function syncDock() {
  $('leave').hidden = !wearer;
  $('try').hidden = Boolean(wearer);
  $('open-wardrobe').hidden = Boolean(wearer);
  $('shop-worn').hidden = !wearer;
  $('shop').hidden = Boolean(wearer) || undressed();
  $('shop-bag').hidden = $('shop').hidden;
  $('steps').hidden = !history.length && !future.length;
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
  syncTurn();
  syncPrint();
}

/* The keepsake: one instant photo per try-on, piled up beside the figure and kept in this browser */

let printing = 0; // Only the print of what is on the stand now gets shown.
let printed = {}; // What the live print was made from.
let prints = []; // The pile, newest first: { id, front, back, caption, place, look, person, at }. The pile shows the front.
let replacing = null; // The print a Make it again replaces, once the new one is out.
const printIds = new WeakMap(); // Which print belongs to each try-on, so a new room redoes it instead of adding one.
const printUrls = new Map();
let liveId = null; // The print of whoever is on the stand now.
let opened = null; // The print open in the viewer, and the side it shows.
let openedSide = 'front';
let binned = null; // The last print deleted, until its Undo runs out: { print, index, timer }.
const UNDO_MS = 5000;

const blobOf = (print, side = 'front') => (side === 'back' ? print.back : print.front ?? print.blob);
const urlOf = (print, side = 'front') => {
  const key = `${print.id}:${side}`;
  if (!printUrls.has(key)) printUrls.set(key, URL.createObjectURL(blobOf(print, side)));
  return printUrls.get(key);
};
const forget = (id) => {
  for (const side of ['front', 'back']) {
    URL.revokeObjectURL(printUrls.get(`${id}:${side}`));
    printUrls.delete(`${id}:${side}`);
  }
};
const fileOf = (print, side) => {
  const day = new Date(print.at).toISOString().slice(0, 10);
  const name = `${APP_NAME.toLowerCase()}-${day}-${print.id.slice(-4)}${side === 'back' ? '-back' : ''}.jpg`;
  return new File([blobOf(print, side)], name, { type: 'image/jpeg' });
};
const facingBack = () => wrap(tween?.to ?? angle) === 180;

/** Develops the front, and the back once it arrives, for each try-on and room. It stays on the pile after they leave. */
async function syncPrint() {
  const back = wearer?.back;
  if (wearer === printed.person && back === printed.back && room === printed.room) return;
  const ticket = ++printing;
  printed = { person: wearer, back, room };
  if (!wearer) {
    liveId = null;
    renderPile();
    return;
  }
  const person = wearer;
  const { top, bottom, outer } = LOOKS.get(plainLook(person.look));
  const caption = [outer, top, bottom].filter(Boolean).slice(0, 2).map((item) => item.name).join(', ');
  const [front, rear] = await Promise.all([
    makePrint({ person: person.front, place: room, caption }),
    back ? makePrint({ person: back, place: room, caption }) : null,
  ]);
  if (ticket !== printing) return;
  let id = printIds.get(person);
  const fresh = !id || !prints.some((print) => print.id === id);
  if (fresh) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    printIds.set(person, id);
  } else forget(id);
  // The person's own images go with the print, so Wear this again can put them back on the stand for free.
  const print = { id, front, back: rear, caption, place: room.name, look: person.look, person: { front: person.front, back: person.back ?? null }, at: Date.now() };
  prints = [print, ...prints.filter((entry) => entry.id !== id)];
  if (fresh && replacing) {
    const old = replacing;
    replacing = null;
    prints = prints.filter((entry) => entry.id !== old);
    dropPrint(old);
    forget(old);
  }
  liveId = id;
  for (const gone of await keepPrint(print, prints)) forget(gone);
  prints = prints.slice(0, KEEP);
  renderPile(fresh ? id : null);
  if ($('snap-view').open && (opened === id || fresh)) showPrint(id, openedSide);
}

const PILE = 3; // Prints drawn in the pile; the rest are counted on its label.
const DEVELOP_MS = 3800; // Its way out and the photo developing, as timed in the stylesheet.

function renderPile(fresh) {
  const pile = $('snap-pile');
  const shown = prints.slice(0, PILE);
  const kept = new Map([...pile.children].map((card) => [card.dataset.id, card]));
  for (const [id, card] of kept) if (!shown.some((print) => print.id === id)) card.remove();
  shown.forEach((print, index) => {
    let card = kept.get(print.id);
    if (!card) {
      card = document.createElement('span');
      card.className = 'snap-print';
      card.dataset.id = print.id;
      card.innerHTML = '<img alt="" draggable="false" />';
      // It comes out and develops once; moving it in the page later would replay that, so the pile only reorders by z-index.
      if (print.id === fresh) {
        card.toggleAttribute('data-fresh', true);
        setTimeout(() => card.removeAttribute('data-fresh'), DEVELOP_MS);
      }
      pile.append(card);
    }
    card.querySelector('img').src = urlOf(print);
    card.dataset.at = index;
    card.style.zIndex = PILE - index;
  });
  const count = prints.length;
  $('snap').setAttribute('aria-label', count > 1 ? `Open your ${count} photos` : 'Open your photo');
  $('snap').hidden = !count;
}

/* The print in the viewer is a card with the front on one face and the back on the other, so Front and Back turn it over
   in one unbroken movement. */
const FLIP_MS = 620;
const FLIP_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const cardAt = (degrees) => `perspective(1800px) rotateY(${degrees}deg)`;

/** Where the card is now, mid-turn included: rotateY puts -sin in the third column and cos in the first. */
function cardAngle() {
  const matrix = new DOMMatrix(getComputedStyle($('snap-card')).transform);
  return (Math.atan2(-matrix.m13, matrix.m11) * 180) / Math.PI;
}

function turnCard(side, animate) {
  const card = $('snap-card');
  const to = side === 'back' ? 180 : 0;
  const from = animate ? cardAngle() : to;
  card.getAnimations().forEach((animation) => animation.cancel());
  card.style.transform = cardAt(to);
  if (!animate || !motion || Math.abs(to - from) < 1) return;
  card.animate([{ transform: cardAt(from) }, { transform: cardAt(to) }], { duration: (FLIP_MS * Math.abs(to - from)) / 180, easing: FLIP_EASE });
}

function showPrint(id, side = 'front') {
  const print = prints.find((entry) => entry.id === id) ?? prints[0];
  if (!print) {
    $('snap-view').close();
    return;
  }
  const before = { id: opened, side: openedSide };
  opened = print.id;
  openedSide = side === 'back' && print.back ? 'back' : 'front';
  const url = urlOf(print, openedSide);
  const file = fileOf(print, openedSide);
  const open = $('snap-view').open;
  if (before.id !== opened || !open) {
    // Another photo: both faces change, it opens on the side asked for, and fades in when the viewer is already up.
    $('snap-full').src = urlOf(print);
    $('snap-full-back').hidden = !print.back;
    if (print.back) $('snap-full-back').src = urlOf(print, 'back');
    turnCard(openedSide, false);
    if (open && motion) $('snap-card').animate([{ opacity: 0, scale: 0.985 }, { opacity: 1, scale: 1 }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  } else if (before.side !== openedSide) turnCard(openedSide, true);
  $('snap-save').href = url;
  $('snap-save').download = file.name;
  $('snap-share').hidden = !navigator.canShare?.({ files: [file] });
  $('snap-sides').hidden = !print.back;
  for (const button of $('snap-sides').children) button.setAttribute('aria-pressed', String(button.dataset.side === openedSide));
  // Only the photo of whoever is on the stand can still change room; the others can put their look back on.
  const live = print.id === liveId;
  $('snap-places').hidden = !live;
  // Puts that person back on the stand. Prints from before this was kept have no person, so they can't.
  $('snap-wear').hidden = live || !print.person?.front || !LOOKS.has(plainLook(print.look ?? ''));
  $('snap-redo').hidden = !live || !window.orbitCanRedo?.(print.look);
  const roll = $('snap-roll');
  roll.hidden = prints.length < 2;
  roll.replaceChildren(...prints.map((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'roll-print';
    button.setAttribute('aria-label', `Photo ${index + 1} of ${prints.length}`);
    button.setAttribute('aria-pressed', String(entry.id === opened));
    button.innerHTML = `<img src="${urlOf(entry)}" alt="" draggable="false" />`;
    button.addEventListener('click', () => showPrint(entry.id));
    return button;
  }));
  roll.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

$('snap').addEventListener('click', () => {
  // The photo of whoever is on the stand opens on the side they are showing.
  showPrint(prints[0]?.id, prints[0]?.id === liveId && facingBack() ? 'back' : 'front');
  $('snap-view').showModal();
});
for (const button of $('snap-sides').children) button.addEventListener('click', () => showPrint(opened, button.dataset.side));
$('snap-close').addEventListener('click', () => $('snap-view').close());
$('snap-view').addEventListener('click', (e) => {
  if (e.target === $('snap-view')) $('snap-view').close();
});
$('snap-share').addEventListener('click', () => {
  const print = prints.find((entry) => entry.id === opened);
  if (print) navigator.share({ files: [fileOf(print, openedSide)], title: APP_NAME }).catch(() => {});
});

/** Puts that photo's person back on the stand, in its look. Muse already made them, so it costs nothing. */
$('snap-wear').addEventListener('click', () => {
  const print = prints.find((entry) => entry.id === opened);
  if (!print?.person?.front) return;
  $('snap-view').close();
  const person = { look: print.look, front: print.person.front, back: print.person.back ?? undefined };
  if (!person.back) person.failed = true;
  printIds.set(person, print.id);
  wearLook(print.look);
  renderLook();
  dispatchEvent(new CustomEvent('orbit:wear', { detail: person }));
});

/** Asks Muse for this try-on again, for when it came out wrong. The new photo takes the old one's place. */
$('snap-redo').addEventListener('click', () => {
  const print = prints.find((entry) => entry.id === opened);
  if (!print || print.id !== liveId) return;
  $('snap-view').close();
  replacing = print.id;
  dispatchEvent(new CustomEvent('orbit:redo', { detail: { look: print.look } }));
});
// A Make it again that fails keeps the photo it was meant to replace.
addEventListener('orbit:wait', (e) => {
  if (!e.detail) replacing = null;
});

/** A deleted photo leaves at once, and is only gone for good when its Undo runs out. */
function bin() {
  if (!binned) return;
  clearTimeout(binned.timer);
  dropPrint(binned.print.id);
  forget(binned.print.id);
  binned = null;
}

function hideToast() {
  if ($('toast').matches(':popover-open')) $('toast').hidePopover();
}

/** An open viewer makes the rest of the page inert, so the note lives inside it while it is open. */
function showToast() {
  hideToast();
  ($('snap-view').open ? $('snap-view') : document.body).append($('toast'));
  $('toast').showPopover();
}

$('snap-view').addEventListener('close', () => {
  if (!$('toast').matches(':popover-open')) return;
  showToast();
});

$('snap-delete').addEventListener('click', () => {
  const index = prints.findIndex((entry) => entry.id === opened);
  if (index < 0) return;
  bin();
  clearTimeout(undoGarment?.timer);
  undoGarment = null;
  const [print] = prints.splice(index, 1);
  binned = { print, index, live: print.id === liveId, timer: setTimeout(() => { bin(); hideToast(); }, UNDO_MS) };
  // The person stays on the stand without a photo until the room changes or Undo brings it back.
  if (binned.live) liveId = null;
  renderPile();
  showPrint(prints[Math.min(index, prints.length - 1)]?.id);
  $('toast-text').textContent = 'Photo deleted';
  showToast();
});

$('toast-undo').addEventListener('click', async () => {
  if (undoGarment) {
    const { id, timer } = undoGarment;
    clearTimeout(timer);
    undoGarment = null;
    hideToast();
    await fetch(`api/catalog/${id}/restore`, { method: 'POST' }).catch(() => null);
    refreshWardrobe();
    return;
  }
  if (!binned) return;
  clearTimeout(binned.timer);
  const { print, index, live } = binned;
  binned = null;
  prints.splice(Math.min(index, prints.length), 0, print);
  if (live && printIds.get(wearer) === print.id) liveId = print.id;
  renderPile();
  if ($('snap-view').open) showPrint(print.id);
  hideToast();
});
addEventListener('pagehide', bin);
addEventListener('orbit:back', syncPrint);

loadPrints().then((saved) => {
  // Photos kept before the shopper's own pictures were stored with them cannot be worn again, so they are let go.
  const old = saved.filter((print) => !print.person?.front);
  old.forEach((print) => dropPrint(print.id));
  saved = saved.filter((print) => !old.includes(print));
  prints = [...prints, ...saved.filter((print) => !prints.some((entry) => entry.id === print.id))].slice(0, KEEP);
  renderPile();
});

function remember() {
  history.push({ look: shown, wearer });
  if (history.length > HISTORY) history.shift();
  future.length = 0;
  syncDock();
}

/** Takes the last step off one list and leaves where the figure was on the other, so Back and Forward undo each other. */
function travel(from, to) {
  const previous = from.pop();
  if (!previous) return;
  to.push({ look: shown, wearer });
  dressing++;
  stopWaiting();
  lockTurn(false);
  notice('');
  wearLook(previous.look);
  wearer = previous.wearer;
  syncDock();
  if (wearer) turnTo(Math.round(angle / 360) * 360);
  renderLook();
  change(() => {
    shown = previous.look;
    drawn = '';
    draw();
  });
}

$('undo').addEventListener('click', () => travel(history, future));
$('redo').addEventListener('click', () => travel(future, history));

function leaveWearer() {
  if (!wearer) return;
  wearer = null;
  change(() => {
    drawn = '';
    draw();
  });
  syncDock();
}

$('leave').addEventListener('click', () => {
  remember();
  leaveWearer();
});
addEventListener('orbit:wait', (e) => {
  lockTurn(Boolean(e.detail));
  if (e.detail) wait(e.detail.seconds, e.detail.steps);
  else stopWaiting();
});
/** The person rises out of the mannequin from the stand up, taking its place line by line. */
async function reveal(front) {
  const image = $('reveal');
  image.src = front;
  await image.decode().catch(() => {});
  image.hidden = false;
  $('loader').hidden = true;
  $('body').toggleAttribute('data-lifting', true);
  const rise = [{ '--rise': '-16%' }, { '--rise': '100%' }];
  const timing = { duration: REVEAL_MS, easing: 'cubic-bezier(0.45, 0, 0.15, 1)', fill: 'forwards' };
  $('body').animate(rise, timing);
  await image.animate(rise, timing).finished;
}

addEventListener('orbit:wear', async (e) => {
  await finishWaiting();
  lockTurn(true);
  remember();
  turnTo(Math.round(angle / 360) * 360);
  if (motion) await reveal(e.detail.front);
  wearer = e.detail;
  syncDock();
  drawn = '';
  draw();
  await Promise.all(frames.map((image) => image.decode().catch(() => {})));
  stopWaiting();
  lockTurn(false);
  // The figure underneath clears behind the person before they let go of it.
  setTimeout(() => {
    $('reveal').hidden = true;
    $('body').removeAttribute('data-lifting');
    for (const id of ['reveal', 'body']) $(id).getAnimations().forEach((animation) => animation.cancel());
  }, 320);
});
addEventListener('orbit:back', syncTurn);
window.orbitLook = () => shown;

fetch('api/looks').then((response) => response.json()).then((list) => {
  saved = list;
  drawn = '';
  label();
});

setPlace(PLACES[0]);
wearLook(FIRST_LOOK);
renderLook();
showWardrobe(false);
for (const look of [FIRST_LOOK, `${MAN}bare`]) VIEWS.forEach((view) => load(picture(look, view)));
requestAnimationFrame(frame);
enter();

/** Lifts the curtain once the room, the stand and the figure are ready, or after a few seconds whatever happens. */
async function enter() {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  await new Promise(requestAnimationFrame);
  const images = [...document.querySelectorAll('.plate, .stand, .frame')].filter((image) => image.getAttribute('src'));
  const ready = Promise.all([document.fonts.ready, ...images.map((image) => image.decode().catch(() => {}))]);
  await Promise.race([Promise.all([ready, pause(motion ? 1200 : 0)]), pause(4000)]);
  document.body.removeAttribute('data-intro');
  setTimeout(() => $('intro').remove(), 1000);
  if (!motion) return;
  const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
  $('figure').animate([{ opacity: 0, translate: '0 4%', filter: 'blur(10px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0)' }], { duration: 1200, delay: 380, easing: ease, fill: 'backwards' });
  [...document.querySelectorAll('header, .places, .wardrobe-rail, .tag, .dock, .steps, .snap')].forEach((element, index) => {
    element.animate([{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], { duration: 700, delay: 900 + index * 90, easing: ease, fill: 'backwards' });
  });
}

if (import.meta.env.DEV) {
  window.studio = {
    set angle(value) { angle = value; tween = null; draw(); },
    get saved() { return saved; },
    state,
    PLACES,
    setPlace,
  };
}
