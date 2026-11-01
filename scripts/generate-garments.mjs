// Grows the catalogue: each new garment gets a front in the house style, then a matching back, and each place gets a
// stand of its own. Finished files are skipped, so a rerun only pays for what is missing.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WORKERS = 4;
const GREEN = 'Solid uniform chroma-key green background (#00B140), evenly lit, with no shadow, no floor line and no gradient.';

const GARMENTS = {
  'tee-ink': ['tee', 'a black heavyweight cotton crew-neck t-shirt'],
  'tee-breton': ['tee', 'a Breton striped cotton t-shirt with ecru ground and thin navy horizontal stripes'],
  'tee-rust': ['tee', 'a rust orange garment-dyed cotton crew-neck t-shirt'],
  'shirt-white': ['shirt', 'a crisp white linen long-sleeve button-up shirt'],
  'shirt-flannel': ['shirt', 'a grey and navy checked brushed flannel long-sleeve button-up shirt'],
  'shirt-stripe': ['shirt', 'a blue and white fine bengal striped cotton long-sleeve button-up shirt'],
  'jacket-denim': ['jacket', 'a mid-wash blue denim trucker jacket worn open'],
  'jacket-bomber': ['jacket', 'a black nylon bomber jacket with ribbed collar and cuffs, worn open'],
  'jacket-camel': ['jacket', 'a camel wool short overcoat worn open'],
  'dress-black': ['dress', 'a black sleeveless crepe midi dress with a round neck'],
  'dress-navy': ['dress', 'a navy cotton short-sleeve midi shirt dress with buttons down the front'],
  'dress-sage': ['dress', 'a sage green short-sleeve linen midi dress'],
  'jeans-black': ['jeans', 'black straight-leg five-pocket jeans'],
  'jeans-light': ['jeans', 'light wash blue straight-leg five-pocket jeans'],
  'jeans-ecru': ['jeans', 'ecru undyed straight-leg five-pocket jeans'],
  'pants-charcoal': ['chinos', 'charcoal grey tailored wool trousers with a pressed crease'],
  'pants-olive': ['chinos', 'olive green cotton cargo trousers with side pockets'],
  'pants-cream': ['chinos', 'cream pleated wide-leg cotton trousers'],
  'tee-sage': ['tee', 'a sage green slub cotton crew-neck t-shirt'],
  'tee-navy': ['tee', 'a navy cotton crew-neck t-shirt with a chest pocket'],
  'shirt-chambray': ['shirt', 'a mid-blue chambray long-sleeve work shirt with two chest pockets'],
  'shirt-pink': ['shirt', 'a pale pink cotton oxford long-sleeve button-up shirt'],
  'jacket-leather': ['jacket', 'a black leather biker jacket worn open'],
  'jacket-navy': ['jacket', 'a navy wool pea coat worn open'],
  'dress-red': ['dress', 'a crimson red crepe wrap midi dress with short sleeves'],
  'dress-cream': ['dress', 'a cream silk sleeveless slip midi dress'],
  'jeans-grey': ['jeans', 'washed grey straight-leg five-pocket jeans'],
  'jeans-white': ['jeans', 'white straight-leg five-pocket jeans'],
  'pants-navy': ['chinos', 'navy pleated tailored wool trousers'],
  'pants-rust': ['chinos', 'rust brown corduroy straight-leg trousers'],
};

const tasks = [];
for (const [name, [base, description]] of Object.entries(GARMENTS)) {
  const front = `public/studio/raw/green/${name}.webp`;
  tasks.push({
    out: front,
    references: [`public/studio/raw/green/${base}.webp`],
    prompt: `Same photograph style, framing, lighting and invisible-mannequin presentation as this image, but the garment is now ${description}. One garment only, fully in frame, photorealistic fabric, sharp edges. ${GREEN}`,
  });
  tasks.push({
    out: `public/studio/back/${name}.webp`,
    references: [front],
    needs: front,
    prompt: `The exact same garment from this image, seen from directly behind: same colour, fabric, size, proportions and stitching quality, same invisible-mannequin presentation, fully in frame. ${GREEN}`,
  });
}

async function pool(queue) {
  const failed = [];
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    for (let task = queue.shift(); task; task = queue.shift()) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { stdout } = await run('node', ['scripts/muse.mjs', 'edit', task.out, task.prompt, ...task.references], { env: process.env });
          console.log(stdout.includes('budget reached') ? `SKIPPED ${task.out}` : `done ${task.out}`);
          break;
        } catch (error) {
          if (attempt === 3) failed.push(`${task.out}: ${String(error.message).slice(0, 200)}`);
        }
      }
    }
  }));
  failed.forEach((line) => console.log('FAILED', line));
}

await pool(tasks.filter((task) => !task.needs && !existsSync(task.out)));
await pool(tasks.filter((task) => task.needs && existsSync(task.needs) && !existsSync(task.out)));
