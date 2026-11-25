import numpy as np

from rock import fitted_normal
from tiling import blur, fractal, levelled, poisson_disk, standardise, white_noise

SIZE = 1024
TONE_MEAN = 0.5303
TONE_SPREAD = 0.1197
NORMAL_SPREAD = 0.15


def scatter_stones(size, spacing, radius_range, rng, relief, shade, tone_range):
    centres = poisson_disk(size, spacing, rng)
    for centre in centres:
        radius = spacing * rng.uniform(*radius_range)
        squash = rng.uniform(0.62, 1.0)
        turn = rng.uniform(0, np.pi)
        tone = rng.uniform(*tone_range) + (rng.uniform() < 0.06) * rng.uniform(0.2, 0.45)
        crown = rng.uniform(0.7, 1.0)
        reach = int(np.ceil(radius)) + 1
        columns = np.arange(int(centre[0]) - reach, int(centre[0]) + reach + 1)
        rows = np.arange(int(centre[1]) - reach, int(centre[1]) + reach + 1)
        offset_x = (columns - centre[0])[None, :]
        offset_y = (rows - centre[1])[:, None]
        along = (offset_x * np.cos(turn) + offset_y * np.sin(turn)) / radius
        across = (-offset_x * np.sin(turn) + offset_y * np.cos(turn)) / (radius * squash)
        dome = np.clip(1 - (along**2 + across**2), 0, 1)
        lifted = np.minimum(dome * 2.4, 1) * crown
        window = np.ix_(rows % size, columns % size)
        covers = lifted > relief[window]
        relief[window] = np.where(covers, lifted, relief[window])
        shade[window] = np.where(covers, tone * (0.55 + 0.45 * np.minimum(dome * 3, 1)), shade[window])


def surface(seed=4217):
    rng = np.random.default_rng(seed)
    relief = np.zeros((SIZE, SIZE))
    shade = np.zeros((SIZE, SIZE))
    scatter_stones(SIZE, 4.3, (0.42, 0.6), rng, relief, shade, (0.25, 0.75))
    scatter_stones(SIZE, 9.0, (0.36, 0.52), rng, relief, shade, (0.35, 0.95))
    grit = standardise(blur(white_noise(SIZE, rng), 0.55))
    sand = standardise(blur(white_noise(SIZE, rng), 1.1))
    patches = standardise(fractal(SIZE, 6, 4, rng))
    tone = blur(shade, 0.45) + grit * 0.1 + sand * 0.03 + patches * 0.012
    tone -= blur(tone, 20) * 0.85
    albedo = levelled(tone, TONE_MEAN, TONE_SPREAD, 0.04, 0.97)
    height = blur(relief, 0.6) + grit * 0.05 + sand * 0.04
    return albedo, fitted_normal(height, NORMAL_SPREAD)
