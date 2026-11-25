import numpy as np


def lattice_hash(ix, iy, iz, seed):
    n = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 40503)
    n = n & 0xFFFFFFFF
    n = ((n ^ (n >> 15)) * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 3266489917) & 0xFFFFFFFF
    n = n ^ (n >> 16)
    return n / 4294967295.0


def value3(points, seed):
    points = np.asarray(points, dtype=np.float64)
    cell = np.floor(points).astype(np.int64)
    fade = points - cell
    fade = fade * fade * (3 - 2 * fade)
    total = np.zeros(len(points))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                weight = (
                    (fade[:, 0] if dx else 1 - fade[:, 0])
                    * (fade[:, 1] if dy else 1 - fade[:, 1])
                    * (fade[:, 2] if dz else 1 - fade[:, 2])
                )
                total += weight * lattice_hash(cell[:, 0] + dx, cell[:, 1] + dy, cell[:, 2] + dz, seed)
    return total


def fbm3(points, octaves, seed, gain=0.5):
    points = np.asarray(points, dtype=np.float64)
    total = np.zeros(len(points))
    amplitude = 1.0
    reach = 0.0
    for octave in range(octaves):
        total += amplitude * value3(points * 2**octave + octave * 17.31, seed + octave)
        reach += amplitude
        amplitude *= gain
    return total / reach


def ridged3(points, octaves, seed):
    points = np.asarray(points, dtype=np.float64)
    total = np.zeros(len(points))
    amplitude = 1.0
    reach = 0.0
    for octave in range(octaves):
        sample = value3(points * 2**octave + octave * 9.7, seed + octave)
        total += amplitude * (1 - np.abs(2 * sample - 1))
        reach += amplitude
        amplitude *= 0.5
    return total / reach


def smooth(x):
    return x * x * (3 - 2 * x)


def tile_noise(height, width, cells_y, cells_x, rng):
    grid = rng.random((cells_y, cells_x))
    ys = np.arange(height) * cells_y / height
    xs = np.arange(width) * cells_x / width
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = smooth(ys - y0)[:, None]
    fx = smooth(xs - x0)[None, :]
    y1 = (y0 + 1) % cells_y
    x1 = (x0 + 1) % cells_x
    top = grid[np.ix_(y0, x0)] * (1 - fx) + grid[np.ix_(y0, x1)] * fx
    bottom = grid[np.ix_(y1, x0)] * (1 - fx) + grid[np.ix_(y1, x1)] * fx
    return top * (1 - fy) + bottom * fy


def tile_fbm(height, width, cells_y, cells_x, octaves, rng):
    total = np.zeros((height, width))
    amplitude = 1.0
    reach = 0.0
    for octave in range(octaves):
        total += amplitude * tile_noise(height, width, cells_y * 2**octave, cells_x * 2**octave, rng)
        reach += amplitude
        amplitude *= 0.5
    return total / reach
