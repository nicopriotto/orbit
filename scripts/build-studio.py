"""
Prepares the 2D studio from Muse Image output: cuts each look, garment and the stand out of their green screens, and
makes the place thumbnails. Run from the project root.
"""

import glob
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

OUT = Path('public/studio')
CANVAS = (1120, 2130)
FIGURE = (70, 2080)  # Where head and feet land in every frame.
PLATE = 3200  # Width of a finished place.


def smooth(low, high, x):
    t = np.clip((x - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def key(path):
    """Green-screen matte: alpha from how far green rises above the other channels, then spill removed at the edge."""
    rgb = np.asarray(Image.open(path).convert('RGB'), np.float32) / 255
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    excess = g - np.maximum(r, b)
    alpha = 1 - smooth(0.1, 0.3, excess)
    alpha = cv2.erode(alpha, np.ones((3, 3)))
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.7)
    edge = cv2.dilate((alpha < 0.98).astype(np.float32), np.ones((9, 9)))
    limit = np.maximum(r, b) * 1.02
    rgb[..., 1] = g + (np.minimum(g, limit) - g) * edge
    return rgb, alpha


def frame(path, destination):
    """Every frame gets the same height and the head on the centre line, so a turn pivots instead of jittering."""
    rgb, alpha = key(path)
    ys, xs = np.where(alpha > 0.5)
    top, bottom = ys.min(), ys.max()
    head = alpha[top:top + (bottom - top) // 10] > 0.5
    centre = np.where(head.any(0))[0].mean()
    scale = (FIGURE[1] - FIGURE[0]) / (bottom - top)
    shift = np.float32([[scale, 0, CANVAS[0] / 2 - centre * scale], [0, scale, FIGURE[0] - top * scale]])
    warp = lambda layer: cv2.warpAffine(layer, shift, CANVAS, flags=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    rgba = np.clip(np.dstack([warp(rgb), warp(alpha)]), 0, 1)
    Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').save(destination, quality=90, alpha_quality=95)


def cutout(path, destination):
    rgb, alpha = key(path)
    ys, xs = np.where(alpha > 0.5)
    box = (slice(max(ys.min() - 12, 0), ys.max() + 12), slice(max(xs.min() - 12, 0), xs.max() + 12))
    image = Image.fromarray((np.dstack([rgb, alpha])[box] * 255).astype(np.uint8), 'RGBA')
    image.thumbnail((640 if 'item-' in destination.name else 1200, 1200))
    image.save(destination, quality=90, alpha_quality=95)


def sheet():
    """The four bare views side by side on green: what Muse dresses to draw every view of a look in one image."""
    views = [Image.open(OUT / 'set' / f'bare-{view}.webp').convert('RGBA') for view in ('front', 'front34', 'side', 'back')]
    canvas = Image.new('RGB', (CANVAS[0] * len(views), CANVAS[1]), (0, 177, 64))
    for i, view in enumerate(views):
        canvas.paste(view, (i * CANVAS[0], 0), view)
    canvas.resize((1600, 761), Image.LANCZOS).save(OUT / 'm' / 'sheet.webp', quality=92)


def plate(path):
    """Enlarges a place past what Muse returns and restores edge contrast, so it stays crisp on a large display."""
    image = Image.open(path).convert('RGB')
    image = image.resize((PLATE, round(image.height * PLATE / image.width)), Image.LANCZOS)
    image = image.filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
    image.save(OUT / 'places' / Path(path).name, quality=88, method=6)
    thumb = image.copy()
    thumb.thumbnail((200, 200))
    thumb.save(OUT / 'places' / f'{Path(path).stem}-thumb.webp', quality=82)


def main():
    (OUT / 'set').mkdir(parents=True, exist_ok=True)
    for path in glob.glob(str(OUT / 'raw/places/*.webp')):
        plate(path)
    for path in glob.glob(str(OUT / 'raw/stand-*.webp')):
        cutout(path, OUT / 'set' / Path(path).name)
    for view in ('front', 'front34', 'side', 'back'):
        frame(OUT / 'm' / f'{view}.webp', OUT / 'set' / f'bare-{view}.webp')
    sheet()
    for path in glob.glob(str(OUT / 'm/looks/*.webp')):
        frame(path, OUT / 'set' / Path(path).name)
    for path in glob.glob(str(OUT / 'raw/green/*.webp')):
        cutout(path, OUT / 'set' / f'item-{Path(path).stem}.webp')
    for path in glob.glob(str(OUT / 'back/*.webp')):
        cutout(path, OUT / 'set' / f'item-{Path(path).stem}-back.webp')


main()
