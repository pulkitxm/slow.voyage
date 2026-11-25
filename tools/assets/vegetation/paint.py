import math

import numpy as np

from noise import tile_fbm


def colour(red, green, blue):
    return np.array([red, green, blue], dtype=np.float64) / 255.0


def to_linear(values):
    values = np.clip(values, 0, 1)
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def to_display(values):
    values = np.clip(values, 0, 1)
    return np.where(values <= 0.0031308, values * 12.92, 1.055 * values ** (1 / 2.4) - 0.055)


def dim(pixels, glow):
    return to_display(to_linear(pixels) / glow)


class Canvas:
    def __init__(self, size, seed, oversample=2):
        self.size = size
        self.oversample = oversample
        self.cells = size * oversample
        self.pixel = 1.0 / self.cells
        self.rgb = np.zeros((self.cells, self.cells, 3))
        self.alpha = np.zeros((self.cells, self.cells))
        self.rng = np.random.default_rng(seed)
        self.grain = tile_fbm(self.cells, self.cells, 40, 40, 3, self.rng)
        self.clip = (0.0, 0.0, 1.0, 1.0)

    def window(self, u0, v0, u1, v1):
        cells = self.cells
        u0, v0 = max(u0, self.clip[0]), max(v0, self.clip[1])
        u1, v1 = min(u1, self.clip[2]), min(v1, self.clip[3])
        c0, c1 = max(0, math.floor(u0 * cells)), min(cells, math.ceil(u1 * cells))
        r0, r1 = max(0, math.floor(v0 * cells)), min(cells, math.ceil(v1 * cells))
        if c1 <= c0 or r1 <= r0:
            return None
        us = (np.arange(c0, c1) + 0.5) / cells
        vs = (np.arange(r0, r1) + 0.5) / cells
        grid_u, grid_v = np.meshgrid(us, vs)
        return (slice(r0, r1), slice(c0, c1)), grid_u, grid_v

    def blend(self, area, tint, coverage):
        before = self.alpha[area]
        after = before + coverage * (1 - before)
        kept = (before * (1 - coverage))[..., None]
        mixed = self.rgb[area] * kept + np.clip(tint, 0, 1) * coverage[..., None]
        self.rgb[area] = mixed / np.maximum(after, 1e-9)[..., None]
        self.alpha[area] = after

    def fill(self, rect, painter):
        found = self.window(*rect)
        if not found:
            return
        area, grid_u, grid_v = found
        tint = painter(grid_u, grid_v, self.grain[area])
        self.blend(area, tint, np.ones(grid_u.shape))

    def stroke(self, start, end, start_width, end_width, tint):
        reach = max(start_width, end_width) + 2 * self.pixel
        found = self.window(
            min(start[0], end[0]) - reach,
            min(start[1], end[1]) - reach,
            max(start[0], end[0]) + reach,
            max(start[1], end[1]) + reach,
        )
        if not found:
            return
        area, grid_u, grid_v = found
        dx, dy = end[0] - start[0], end[1] - start[1]
        span = dx * dx + dy * dy + 1e-12
        along = np.clip(((grid_u - start[0]) * dx + (grid_v - start[1]) * dy) / span, 0, 1)
        distance = np.hypot(grid_u - (start[0] + along * dx), grid_v - (start[1] + along * dy))
        width = start_width + (end_width - start_width) * along
        coverage = np.clip((width - distance) / self.pixel + 0.5, 0, 1)
        shade = 0.8 + 0.4 * self.grain[area]
        lit = 1 - 0.25 * np.clip(distance / np.maximum(width, 1e-9), 0, 1) ** 2
        self.blend(area, tint * (shade * lit)[..., None], coverage)

    def leaf(
        self,
        base,
        tip,
        half_width,
        tint,
        belly=0.42,
        point=1.0,
        veins=7,
        vein_strength=0.12,
        serration=0.0,
        teeth=0,
        stripe=None,
        stripe_count=7,
        rib=None,
    ):
        reach = half_width + 2 * self.pixel
        found = self.window(
            min(base[0], tip[0]) - reach,
            min(base[1], tip[1]) - reach,
            max(base[0], tip[0]) + reach,
            max(base[1], tip[1]) + reach,
        )
        if not found:
            return
        area, grid_u, grid_v = found
        dx, dy = tip[0] - base[0], tip[1] - base[1]
        length = math.hypot(dx, dy) + 1e-12
        along = ((grid_u - base[0]) * dx + (grid_v - base[1]) * dy) / (length * length)
        across = ((grid_u - base[0]) * dy - (grid_v - base[1]) * dx) / length
        inside = np.clip(along, 0, 1)
        power = math.log(0.5) / math.log(belly)
        profile = np.sin(math.pi * inside**power) ** point
        if serration:
            profile = profile * (1 - serration * (0.5 + 0.5 * np.cos(math.tau * teeth * inside)))
        width = half_width * profile
        coverage = np.clip((width - np.abs(across)) / self.pixel + 0.5, 0, 1)
        coverage = coverage * (along > 0) * (along < 1)
        relative = np.clip(np.abs(across) / np.maximum(width, 1e-9), 0, 1)
        shade = (0.84 + 0.26 * inside) * np.where(across > 0, 1.05, 0.95)
        shade = shade * (0.88 + 0.24 * self.grain[area]) * (1 - 0.14 * relative**4)
        painted = np.broadcast_to(tint, grid_u.shape + (3,)) * 1.0
        wave = np.sin(math.tau * (inside * veins - relative * 0.9))
        if stripe is not None:
            band = np.sin(math.tau * (inside * stripe_count - relative * 1.1))
            amount = np.clip((band - 0.05) * 3.5, 0, 1) * np.clip((0.93 - relative) * 9, 0, 1)
            amount = amount * np.clip(relative * 7 - 0.4, 0, 1)
            painted = painted * (1 - amount[..., None]) + stripe * amount[..., None]
        painted = painted * shade[..., None]
        ribbing = np.clip((wave - 0.9) * 10, 0, 1) * (relative < 0.92) * vein_strength
        midrib = np.exp(-((across / (0.05 * half_width + self.pixel)) ** 2)) * 0.9
        pale = (rib if rib is not None else np.clip(tint * 1.5 + 0.08, 0, 1))
        highlight = np.clip(ribbing + midrib, 0, 1)[..., None]
        painted = painted * (1 - highlight) + pale * highlight
        self.blend(area, painted, coverage)

    def finish(self, glow, opaque=False):
        size, over = self.size, self.oversample
        alpha = self.alpha.reshape(size, over, size, over).mean(axis=(1, 3))
        weighted = (self.rgb * self.alpha[..., None]).reshape(size, over, size, over, 3).mean(axis=(1, 3))
        rgb = weighted / np.maximum(alpha, 1e-6)[..., None]
        known = alpha > 0.02
        average = rgb[known].mean(axis=0) if known.any() else np.zeros(3)
        filled = np.where(known[..., None], rgb, 0.0)
        mask = known.astype(np.float64)
        shifts = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
        for _ in range(48):
            total = np.zeros_like(filled)
            count = np.zeros_like(mask)
            for dy, dx in shifts:
                total += np.roll(filled * mask[..., None], (dy, dx), axis=(0, 1))
                count += np.roll(mask, (dy, dx), axis=(0, 1))
            grow = (mask == 0) & (count > 0)
            filled[grow] = total[grow] / count[grow][..., None]
            mask[grow] = 1.0
        filled = np.where(mask[..., None] > 0, filled, average)
        result = np.empty((size, size, 4), dtype=np.float32)
        result[..., :3] = dim(filled, glow)
        result[..., 3] = 1.0 if opaque else np.clip(alpha * 1.35, 0, 1)
        return result


def save_image(pixels, path, non_colour=False):
    import bpy

    height, width = pixels.shape[:2]
    image = bpy.data.images.new(path.split("/")[-1], width, height, alpha=True)
    image.alpha_mode = "STRAIGHT"
    if non_colour:
        image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)
    loaded = bpy.data.images.load(path)
    loaded.alpha_mode = "STRAIGHT"
    if non_colour:
        loaded.colorspace_settings.name = "Non-Color"
    return loaded
