// Grows the catalogue: each new garment gets a front in the house style, then a matching back. Finished files are skipped, so a rerun only pays for what is missing.
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
  // The second round: knitwear, skirts and shoes, and pieces that are hard to draw and to cut out.
  'knit-cable': ['shirt', 'a chunky cream cable-knit wool crew-neck sweater with long sleeves'],
  'knit-fairisle': ['shirt', 'a navy wool crew-neck sweater with long sleeves and a multicoloured Fair Isle patterned yoke in red, cream, mustard and green'],
  'knit-mohair': ['shirt', 'a fuzzy moss green mohair cardigan with long sleeves, buttoned, with a soft halo of fine fibres along every edge'],
  'knit-roll': ['shirt', 'a fine black merino wool rollneck sweater with long sleeves'],
  'sweat-floral': ['shirt', 'a heather grey cotton crew-neck sweatshirt with long sleeves and colourful hand-embroidered flowers across the chest and down one sleeve'],
  hoodie: ['shirt', 'an oatmeal cotton pullover hoodie with long sleeves, a kangaroo pocket and drawstrings, hood down'],
  'tee-tiedye': ['tee', 'a pastel pink, lilac and sky blue swirl tie-dye cotton crew-neck t-shirt'],
  'shirt-camp': ['tee', 'a short-sleeve camp-collar button-up shirt in a bold green and cream palm leaf print'],
  'blouse-lace': ['shirt', 'an ivory cotton lace blouse with long sleeves, scalloped edges and an openwork floral pattern'],
  'jacket-puffer': ['jacket', 'a glossy black quilted puffer jacket worn open'],
  'jacket-fringe': ['jacket', 'a tan suede western jacket with long fringe hanging from the chest yoke and along the sleeves, worn open'],
  'jacket-patch': ['jacket', 'a light-wash denim trucker jacket worn open, covered in colourful embroidered patches of flowers, stars and a tiger'],
  'blazer-tweed': ['jacket', 'a brown herringbone wool tweed blazer worn open'],
  'jacket-varsity': ['jacket', 'a forest green wool varsity jacket with cream leather sleeves, striped ribbed cuffs and a cream chenille letter O on the chest, worn open'],
  'dress-floral': ['dress', 'a flowing short-sleeve maxi dress in a dense multicoloured wildflower print'],
  'dress-sequin': ['dress', 'a gold sequinned sleeveless slip midi dress that catches the light'],
  'skirt-pleat': ['chinos', 'a camel pleated midi skirt'],
  'skirt-denim': ['chinos', 'a mid-wash denim A-line midi skirt with front pockets'],
  'skirt-satin': ['chinos', 'a black satin bias-cut midi slip skirt'],
  'skirt-tartan': ['chinos', 'a red and green tartan wool knee-length wrap skirt with a leather buckle'],
  'jeans-patch': ['jeans', 'patchwork straight-leg five-pocket jeans pieced from light, mid and dark denim squares'],
  sneakers: ['sneakers', 'a pair of white leather sneakers'],
  'boots-chelsea': ['sneakers', 'a pair of black leather Chelsea boots with elastic side panels'],
  loafers: ['sneakers', 'a pair of brown suede penny loafers'],
  hightops: ['sneakers', 'a pair of red canvas high-top sneakers with white laces and white soles'],
  sandals: ['sneakers', 'a pair of tan leather flat sandals with crossed straps'],
  'boots-western': ['sneakers', 'a pair of cream leather cowboy boots with colourful embroidered roses on the shafts'],
  runners: ['sneakers', 'a pair of chunky grey and orange trail running sneakers'],
};

const tasks = [];
for (const [name, [base, description]] of Object.entries(GARMENTS)) {
  const front = `public/studio/raw/green/${name}.webp`;
  tasks.push({
    out: front,
    references: [`public/studio/raw/green/${base}.webp`],
    prompt: base === 'sneakers'
      ? `Same photograph style, framing, angle and lighting as this image, but the shoes are now ${description}. One pair only, fully in frame, photorealistic materials, sharp edges. ${GREEN}`
      : `Same photograph style, framing, lighting and invisible-mannequin presentation as this image, but the garment is now ${description}. One garment only, fully in frame, photorealistic fabric, sharp edges. ${GREEN}`,
  });
  tasks.push({
    out: `public/studio/back/${name}.webp`,
    references: [front],
    needs: front,
    prompt: base === 'sneakers'
      ? `The exact same pair of shoes from this image, seen from directly behind so the heels face the camera: same colour, materials, size and proportions, fully in frame. ${GREEN}`
      : `The exact same garment from this image, seen from directly behind: same colour, fabric, size, proportions and stitching quality, same invisible-mannequin presentation, fully in frame. ${GREEN}`,
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
