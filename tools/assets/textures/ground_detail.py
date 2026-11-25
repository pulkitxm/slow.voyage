import numpy as np
from PIL import Image, ImageDraw

from tiling import blur, fractal, levelled, poisson_disk, standardise, white_noise

SIZE = 1024
OVERSAMPLE = 2
TONE_MEAN = 0.6124
TONE_SPREAD = 0.1334


def blade_strokes(size, rng):
    strokes = []
    for tuft in poisson_disk(size, 22.0, rng):
        for _ in range(rng.integers(8, 15)):
            root = tuft + rng.normal(0, 3.5, 2)
            strokes.append((root, rng.uniform(0, 2 * np.pi), rng.uniform(7, 20)))
    for _ in range(26000):
        strokes.append((rng.uniform(0, size, 2), rng.uniform(0, 2 * np.pi), rng.uniform(4, 14)))
    order = rng.permutation(len(strokes))
    return [strokes[index] for index in order]


def draw_blades(size, rng):
    scale = OVERSAMPLE
    canvas = Image.new('L', (size * scale, size * scale), 0)
    pen = ImageDraw.Draw(canvas)
    strokes = blade_strokes(size, rng)
    for rank, (root, heading, length) in enumerate(strokes):
        depth = rank / len(strokes)
        bend = rng.uniform(-0.6, 0.6)
        brightness = 70 + depth * 120 + rng.uniform(-25, 25)
        width = rng.uniform(1.5, 2.8) * scale
        steps = 4
        path = [root]
        for step in range(steps):
            angle = heading + bend * (step + 0.5) / steps
            path.append(path[-1] + np.array([np.cos(angle), np.sin(angle)]) * length / steps)
        path = np.array(path)
        low = path.min(axis=0) - 3
        high = path.max(axis=0) + 3
        for shift_x in (-size, 0, size):
            if high[0] + shift_x < 0 or low[0] + shift_x > size:
                continue
            for shift_y in (-size, 0, size):
                if high[1] + shift_y < 0 or low[1] + shift_y > size:
                    continue
                moved = (path + (shift_x, shift_y)) * scale
                for step in range(steps):
                    lit = brightness * (0.6 + 0.4 * (step + 1) / steps)
                    taper = width * (1 - 0.55 * step / steps)
                    pen.line(
                        [tuple(moved[step]), tuple(moved[step + 1])],
                        fill=int(np.clip(lit, 0, 255)),
                        width=max(1, int(round(taper))),
                    )
    reduced = canvas.resize((size, size), Image.BOX)
    return np.asarray(reduced).astype(float) / 255


def surface(seed=5531):
    rng = np.random.default_rng(seed)
    blades = draw_blades(SIZE, rng)
    soil = standardise(fractal(SIZE, 12, 5, rng, gain=0.6))
    grit = standardise(blur(white_noise(SIZE, rng), 0.6))
    tone = blades + soil * 0.035 + grit * 0.03
    tone = blur(tone, 0.5)
    tone -= blur(tone, 14) * 0.85
    return levelled(tone, TONE_MEAN, TONE_SPREAD, 0.03, 0.97)
