import numpy as np

from tiling import (
    blur,
    fractal,
    linear_to_srgb,
    normal_map,
    sample_wrapped,
    smoothstep,
    srgb_to_linear,
    standardise,
    white_noise,
    worley,
)

SIZE = 512
LINEAR_MEAN = np.array([0.2314, 0.1465, 0.0838])
TONE_SPREAD = np.array([0.0615, 0.0563, 0.0486])
WARM_SHIFT = np.array([0.02, 0.004, -0.016])
NORMAL_SPREAD = 0.2


def bedding(size, rng):
    layer_count = 15
    edges = np.sort(rng.uniform(0, 1, layer_count))
    lift = rng.uniform(-1, 1, layer_count)
    tone = rng.uniform(-1, 1, layer_count)
    lean = rng.uniform(-0.2, 0.9, layer_count)
    broad = fractal(size, 2, 4, rng)
    ragged = fractal(size, 9, 3, rng)
    rows = (np.arange(size)[:, None] + 0.5) / size
    position = (rows + broad * 0.055 + ragged * 0.008 - edges[0]) % 1
    spans = np.diff(np.append(edges, edges[0] + 1))
    starts = edges - edges[0]
    layer = np.clip(np.searchsorted(starts, position, side='right') - 1, 0, layer_count - 1)
    within = (position - starts[layer]) / spans[layer]
    depth = np.minimum(within, 1 - within) * spans[layer] * size
    seam = np.exp(-((depth / 2.2) ** 2)) * rng.uniform(0.1, 1, layer_count)[layer] * smoothstep(-0.35, 0.2, ragged)
    height = lift[layer] + lean[layer] * (within - 0.5)
    return height, tone[layer], seam


def fractures(size, cells_x, cells_y, wander, presence, width, rng):
    nearest, second, owner = worley(size, cells_x, cells_y, rng)
    wander_x = fractal(size, 3, 5, rng, gain=0.6) * size * wander
    wander_y = fractal(size, 3, 5, rng, gain=0.6) * size * wander * 0.6
    gap = sample_wrapped(second - nearest, wander_x, wander_y)
    offsets = rng.uniform(-1, 1, owner.max() + 1)
    wrapped_y = (np.rint(np.arange(size)[:, None] + wander_y) % size).astype(int)
    wrapped_x = (np.rint(np.arange(size)[None, :] + wander_x) % size).astype(int)
    block = offsets[owner][wrapped_y, wrapped_x]
    open_mask = smoothstep(-0.1, 0.25, fractal(size, 3, 3, rng) + presence - 0.5)
    crack = (1 - smoothstep(0.0, width, gap)) * open_mask
    return crack, block


def surface(seed=7103):
    rng = np.random.default_rng(seed)
    layer_height, layer_tone, seam = bedding(SIZE, rng)
    crack, block = fractures(SIZE, 5, 3, 0.08, 0.62, 0.05, rng)
    hairline, chip_block = fractures(SIZE, 9, 7, 0.05, 0.35, 0.05, rng)
    streaks = fractal(SIZE, 3, 5, rng, gain=0.6, stretch=(1, 5), ridged=True)
    lumps = fractal(SIZE, 4, 6, rng, gain=0.6)
    chips = fractal(SIZE, 20, 3, rng, gain=0.6, ridged=True)
    grain = standardise(blur(white_noise(SIZE, rng), 0.7))
    height = (
        blur(layer_height, 1.6) * 0.8
        + blur(block, 2.0) * 0.3
        + blur(chip_block, 1.5) * 0.08
        + lumps * 1.1
        + streaks * 0.3
        - chips * 0.16
        - blur(seam, 0.9) * 0.45
        - blur(crack, 0.9) * 0.4
        - blur(hairline, 0.7) * 0.15
        + grain * 0.012
    )
    hollow = standardise(height - blur(height, 9))
    mottle = fractal(SIZE, 2, 5, rng, gain=0.6)
    stain = fractal(SIZE, 3, 4, rng, stretch=(1, 3))
    tone = (
        blur(layer_tone, 1.5) * 0.6
        + standardise(mottle) * 0.6
        + standardise(streaks) * 0.35
        + hollow * 0.5
        + blur(block, 2.0) * 0.3
        - blur(seam, 1.0) * 0.75
        - blur(crack, 1.0) * 0.8
        - blur(hairline, 0.8) * 0.4
        + grain * 0.28
    )
    tone = standardise(np.tanh(standardise(tone) * 0.6))
    warmth = standardise(standardise(stain) + standardise(mottle) * 0.5 + blur(layer_tone, 2.0) * 0.6)
    base = linear_to_srgb(LINEAR_MEAN)
    colour = base + tone[..., None] * TONE_SPREAD + warmth[..., None] * WARM_SHIFT
    colour = np.clip(colour, 0.02, 0.98)
    for _ in range(4):
        linear = srgb_to_linear(colour)
        colour = linear_to_srgb(linear * LINEAR_MEAN / linear.mean(axis=(0, 1)))
    return colour, fitted_normal(height, NORMAL_SPREAD)


def fitted_normal(height, spread):
    low, high = 0.0, 400.0
    for _ in range(40):
        strength = (low + high) / 2
        normal = normal_map(height, strength)
        if normal[..., :2].std() < spread:
            low = strength
        else:
            high = strength
    return normal_map(height, (low + high) / 2)
