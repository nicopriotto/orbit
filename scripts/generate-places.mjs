// Paints each place and a stand made for it. Finished files are skipped, so a rerun only pays for what is missing.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WORKERS = 4;
const SIZE = process.env.PLACE_SIZE ?? '2560x1440';
const FRAME = 'Straight-on architectural interior photograph at chest height, wide 16:9 composition, symmetrical, with a large clear empty area of floor in the centre and the floor visible across the lower third. No people, no mannequins, no clothing racks in the centre, no text, no logos. Natural soft light, rich material detail, tack sharp from front to back, high-end editorial quality, ultra detailed.';
const GREEN = 'Solid uniform chroma-key green background (#00B140), evenly lit, with no shadow, no floor line and no gradient.';

const PLACES = {
  fitting: {
    scene: 'The inside of a generous luxury clothing store fitting room: warm oak wall panels, a heavy floor-length cream linen curtain drawn across the back wall, slim brass wall lights glowing softly, a small upholstered bench against one side wall, a few brass hooks, herringbone oak floor.',
    stand: 'dark smoked oak with a slim brushed brass rim',
  },
  boutique: {
    scene: 'A calm contemporary clothing boutique after closing: pale plaster arches, travertine display plinths and slim brass rails along the far walls, tall shop windows with soft daylight, polished pale terrazzo floor.',
    stand: 'pale terrazzo stone with a thin brushed brass rim',
  },
  atelier: {
    scene: 'A sunlit Parisian tailoring atelier: tall steel-framed windows, whitewashed brick walls, a long wooden cutting table against the far wall, rolls of fabric on shelves, worn wide oak floorboards.',
    stand: 'worn natural oak with a blackened iron rim',
  },
  courtyard: {
    scene: 'A quiet Mediterranean villa courtyard in warm late afternoon light: limewashed walls, an arched colonnade, climbing bougainvillea, olive trees in terracotta pots along the walls, pale limestone paving.',
    stand: 'pale honed limestone with a soft bevelled edge',
  },
  penthouse: {
    scene: 'An elegant penthouse dressing lounge at blue hour: floor-to-ceiling windows along the far wall onto a softly glowing city skyline, walnut panelling, warm low lamps, dark polished stone floor.',
    stand: 'black marble with white veining and a slim brushed brass rim',
  },
};

const tasks = Object.entries(PLACES).flatMap(([name, { scene, stand }]) => [
  { out: `public/studio/raw/places/${name}.webp`, args: ['generate', `public/studio/raw/places/${name}.webp`, `${scene} ${FRAME}`, SIZE] },
  { out: `public/studio/raw/stand-${name}.webp`, args: ['edit', `public/studio/raw/stand-${name}.webp`, `Keep exactly the same object, shape, proportions, camera angle and framing as this low round display base, but it is now made of ${stand}. Photorealistic material, soft even studio light. ${GREEN}`, 'public/studio/raw/stand.webp'] },
]);

const queue = tasks.filter((task) => !existsSync(task.out));
await Promise.all(Array.from({ length: WORKERS }, async () => {
  for (let task = queue.shift(); task; task = queue.shift()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { stdout } = await run('node', ['scripts/muse.mjs', ...task.args], { env: process.env });
        console.log(stdout.includes('budget reached') ? `SKIPPED ${task.out}` : `done ${task.out}`);
        break;
      } catch (error) {
        console.log(`FAILED ${task.out} (${attempt}): ${String(error.message).slice(0, 300)}`);
      }
    }
  }
}));
