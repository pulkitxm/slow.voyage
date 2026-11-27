import bpy
import numpy as np


def read(path):
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)[::-1].copy()


def shrink(pixels, factor):
    height, width, _ = pixels.shape
    weighted = pixels.copy()
    weighted[..., :3] *= weighted[..., 3:4]
    pooled = weighted.reshape(height // factor, factor, width // factor, factor, 4).mean(axis=(1, 3))
    pooled[..., :3] /= np.maximum(pooled[..., 3:4], 1e-6)
    return pooled


def firm(pixels, strength):
    result = pixels.copy()
    result[..., 3] = np.clip(result[..., 3] * strength, 0, 1)
    return result


def brightness(pixels):
    solid = pixels[..., 3] > 0.5
    colour = pixels[..., :3][solid]
    return float((colour @ np.array([0.3, 0.59, 0.11])).mean())


def gain(pixels, target):
    result = pixels.copy()
    total = 1.0
    for _ in range(4):
        step = target / brightness(result)
        total *= step
        result[..., :3] = np.clip(result[..., :3] * step, 0, 1)
    return total


def scale(pixels, amount):
    result = pixels.copy()
    result[..., :3] = np.clip(result[..., :3] * amount, 0, 1)
    return result


def bleed(pixels, rounds):
    result = pixels.copy()
    known = result[..., 3] > 0.02
    colour = result[..., :3] * known[..., None]
    mean = result[..., :3][known].mean(axis=0)
    for _ in range(rounds):
        total = np.zeros_like(colour)
        weight = np.zeros(known.shape, dtype=np.float32)
        for shift_y, shift_x in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            total += np.roll(colour, (shift_y, shift_x), axis=(0, 1))
            weight += np.roll(known, (shift_y, shift_x), axis=(0, 1))
        fresh = ~known & (weight > 0)
        colour[fresh] = total[fresh] / weight[fresh][:, None]
        known = known | fresh
    colour[~known] = mean
    result[..., :3] = colour
    return result


def write(pixels, path, file_format, quality):
    height, width, _ = pixels.shape
    image = bpy.data.images.new("tile", width, height, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set(np.ascontiguousarray(pixels[::-1], dtype=np.float32).ravel())
    image.file_format = file_format
    image.filepath_raw = path
    image.save(quality=quality)
    bpy.data.images.remove(image)


def over(pixels, backdrop):
    alpha = pixels[..., 3:4]
    flat = pixels.copy()
    flat[..., :3] = pixels[..., :3] * alpha + np.asarray(backdrop, dtype=np.float32) * (1 - alpha)
    flat[..., 3] = 1
    return flat
