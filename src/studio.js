import { APP_NAME, makePrint } from './print.js';
import { KINDS, LOOKS, MAN, UNDER, WARDROBE, lookId, plainLook } from './wardrobe.js';

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
const BACK_WAIT = 'Muse is making the back';
const BACK_FAILED = 'The back did not come through';

const $ = (id) => document.getElementById(id);
const state = { top: null, bottom: null, outer: null };
const frames = [$('frame-a'), $('frame-b')];
const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = (value) => `$${value}`;
const SNEAKERS = { name: 'White leather sneakers', file: 'sneakers' };

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
function wait(seconds) {
  clearInterval(waiting);
  const start = performance.now();
  const tick = () => {
    const elapsed = (performance.now() - start) / 1000;
    $('loader-step').textContent = STEPS[Math.min(Math.floor(elapsed / STEP_SECONDS), STEPS.length - 1)];
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

