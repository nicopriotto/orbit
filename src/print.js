// The keepsake: the shopper in the room they chose, on an instant photo with the app's name on it. It is drawn here, so
// the picture never goes back to a server.
export const APP_NAME = 'Orbit'; // Provisional. The print and its file name both take it from here.

const CARD = { width: 1080, height: 1320 };
const PHOTO = { x: 54, y: 54, width: 972, height: 1040 };
const FIGURE_HEIGHT = 905;
const FIGURE_TOP = 30;
const FIGURE_RATIO = 1120 / 2130;
const STAND_RATIO = 601 / 1200;
// The room keeps the proportions it has in the app: the figure is 74% as tall as the window and stands 23% above its foot.
const ROOM_HEIGHT = FIGURE_HEIGHT / 0.74;
const ROOM_FOOT = FIGURE_TOP + FIGURE_HEIGHT + ROOM_HEIGHT * 0.23;
const INK = '#2c2118';
const SOFT = '#8a7a66';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Hanken Grotesk", system-ui, sans-serif';

async function loadImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function ellipse(context, x, y, width, height, color, solid = 0) {
  context.save();
  context.translate(x, y);
  context.scale(width / 2, height / 2);
  const shadow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  shadow.addColorStop(solid, color);
  shadow.addColorStop(1, 'rgb(14 10 7 / 0)');
  context.fillStyle = shadow;
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawRoom(context, place, plate, stand, body) {
  const middle = PHOTO.width / 2;
  const scale = (place.zoom * ROOM_HEIGHT) / plate.naturalHeight;
  const roomWidth = plate.naturalWidth * scale;
  const roomHeight = plate.naturalHeight * scale;
  context.drawImage(plate, middle - roomWidth / 2, ROOM_FOOT - roomHeight, roomWidth, roomHeight);

  const figureWidth = FIGURE_HEIGHT * FIGURE_RATIO;
  const at = (share) => FIGURE_TOP + FIGURE_HEIGHT * share;
  ellipse(context, middle, at(1.045), figureWidth * 0.96, FIGURE_HEIGHT * 0.19, `rgb(14 10 7 / ${place.shade})`, 0.62);
  const standWidth = figureWidth * 0.74;
  context.drawImage(stand, middle - standWidth / 2, at(0.896), standWidth, standWidth * STAND_RATIO);
  ellipse(context, middle, at(0.975), figureWidth * 0.4, FIGURE_HEIGHT * 0.03, 'rgb(14 10 7 / 0.5)');
  context.drawImage(body, middle - figureWidth / 2, FIGURE_TOP, figureWidth, FIGURE_HEIGHT);
}

/** A faint warmth and darker corners, which is most of what makes it read as a print rather than a screenshot. */
function drawFilm(context) {
  context.fillStyle = 'rgb(255 232 196 / 0.07)';
  context.fillRect(0, 0, PHOTO.width, PHOTO.height);
  const corners = context.createRadialGradient(PHOTO.width / 2, PHOTO.height * 0.46, PHOTO.height * 0.42, PHOTO.width / 2, PHOTO.height * 0.46, PHOTO.height * 0.8);
  corners.addColorStop(0, 'rgb(18 12 8 / 0)');
  corners.addColorStop(1, 'rgb(18 12 8 / 0.34)');
  context.fillStyle = corners;
  context.fillRect(0, 0, PHOTO.width, PHOTO.height);
}

function fit(context, text, size, font, room) {
  let fitted = size;
  context.font = font(fitted);
  while (context.measureText(text).width > room && fitted > 26) {
    fitted -= 2;
    context.font = font(fitted);
  }
}

function drawFoot(context, caption, place) {
  const line = PHOTO.y + PHOTO.height + 92;
  context.textBaseline = 'alphabetic';
  context.fillStyle = INK;
  fit(context, caption, 50, (size) => `italic 500 ${size}px ${SERIF}`, 640);
  context.fillText(caption, PHOTO.x + 6, line);
  context.fillStyle = SOFT;
  context.font = `500 25px ${SANS}`;
  context.fillText(place.name, PHOTO.x + 6, line + 50);

  context.textAlign = 'right';
  context.fillStyle = INK;
  context.font = `600 60px ${SERIF}`;
  context.fillText(APP_NAME, CARD.width - PHOTO.x - 6, line);
  context.fillStyle = SOFT;
  context.font = `500 25px ${SANS}`;
  context.fillText('Dressed by Muse', CARD.width - PHOTO.x - 6, line + 50);
  context.textAlign = 'left';
}

/** Returns the finished print as a JPEG. */
export async function makePrint({ person, place, caption }) {
  const [plate, stand, body] = await Promise.all([
    `studio/places/${place.id}.webp`,
    `studio/set/stand-${place.id}.webp`,
    person,
  ].map(loadImage));
  await Promise.allSettled([
    document.fonts.load(`italic 500 50px ${SERIF}`),
    document.fonts.load(`600 60px ${SERIF}`),
    document.fonts.load(`500 25px ${SANS}`),
  ]);

  const canvas = document.createElement('canvas');
  Object.assign(canvas, CARD);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#f8f4eb';
  context.fillRect(0, 0, CARD.width, CARD.height);
  context.save();
  context.translate(PHOTO.x, PHOTO.y);
  context.beginPath();
  context.rect(0, 0, PHOTO.width, PHOTO.height);
  context.clip();
  drawRoom(context, place, plate, stand, body);
  drawFilm(context);
  context.restore();
  drawFoot(context, caption, place);
  return new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.93));
}
