import numpy as np


def smooth(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def smoothstep(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def periodic_perlin(size, period_x, period_y, rng):
    angles = rng.uniform(0, 2 * np.pi, (period_y, period_x))
    gradient_x = np.cos(angles)
    gradient_y = np.sin(angles)
    x = np.arange(size) * period_x / size
    y = np.arange(size) * period_y / size
    cell_x = np.floor(x).astype(int)
    cell_y = np.floor(y).astype(int)
    local_x = (x - cell_x)[None, :]
    local_y = (y - cell_y)[:, None]
    left = cell_x[None, :]
    right = (cell_x[None, :] + 1) % period_x
    top = cell_y[:, None]
    bottom = (cell_y[:, None] + 1) % period_y

    def corner(row, column, offset_x, offset_y):
        return gradient_x[row, column] * offset_x + gradient_y[row, column] * offset_y

    blend_x = smooth(local_x)
    blend_y = smooth(local_y)
    upper = corner(top, left, local_x, local_y) * (1 - blend_x) + corner(top, right, local_x - 1, local_y) * blend_x
    lower = corner(bottom, left, local_x, local_y - 1) * (1 - blend_x) + corner(
        bottom, right, local_x - 1, local_y - 1
    ) * blend_x
    return (upper * (1 - blend_y) + lower * blend_y) * np.sqrt(2)


def fractal(size, period, octaves, rng, gain=0.5, stretch=(1, 1), ridged=False):
    total = np.zeros((size, size))
    amplitude = 1.0
    weight = 0.0
    for octave in range(octaves):
        frequency = period * 2**octave
        layer = periodic_perlin(size, frequency * stretch[0], frequency * stretch[1], rng)
        if ridged:
            layer = 1 - 2 * np.abs(layer)
        total += layer * amplitude
        weight += amplitude
        amplitude *= gain
    return total / weight


def white_noise(size, rng):
    return rng.standard_normal((size, size))


def blur(field, sigma_x, sigma_y=None):
    sigma_y = sigma_x if sigma_y is None else sigma_y
    frequency_x = np.fft.fftfreq(field.shape[1])[None, :]
    frequency_y = np.fft.fftfreq(field.shape[0])[:, None]
    response = np.exp(-2 * np.pi**2 * ((sigma_x * frequency_x) ** 2 + (sigma_y * frequency_y) ** 2))
    return np.fft.ifft2(np.fft.fft2(field) * response).real


def standardise(field):
    return (field - field.mean()) / field.std()


def sample_wrapped(field, offset_x, offset_y):
    size = field.shape[0]
    grid_y, grid_x = np.mgrid[0:size, 0:size].astype(float)
    x = (grid_x + offset_x) % size
    y = (grid_y + offset_y) % size
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fraction_x = x - x0
    fraction_y = y - y0
    x1 = (x0 + 1) % size
    y1 = (y0 + 1) % size
    upper = field[y0, x0] * (1 - fraction_x) + field[y0, x1] * fraction_x
    lower = field[y1, x0] * (1 - fraction_x) + field[y1, x1] * fraction_x
    return upper * (1 - fraction_y) + lower * fraction_y


def poisson_disk(size, spacing, rng, attempts=24):
    cell = spacing / np.sqrt(2)
    cells = int(np.ceil(size / cell))
    cell = size / cells
    grid = -np.ones((cells, cells), dtype=int)
    points = []
    active = []

    def place(point):
        grid[int(point[1] / cell) % cells, int(point[0] / cell) % cells] = len(points)
        active.append(len(points))
        points.append(point)

    place(rng.uniform(0, size, 2))
    reach = np.arange(-2, 3)
    while active:
        slot = rng.integers(len(active))
        origin = points[active[slot]]
        angle = rng.uniform(0, 2 * np.pi, attempts)
        distance = spacing * np.sqrt(rng.uniform(1, 4, attempts))
        candidates = (origin + np.stack([np.cos(angle), np.sin(angle)], axis=1) * distance[:, None]) % size
        placed = False
        for candidate in candidates:
            column = int(candidate[0] / cell) % cells
            row = int(candidate[1] / cell) % cells
            neighbours = grid[np.ix_((row + reach) % cells, (column + reach) % cells)].ravel()
            neighbours = neighbours[neighbours >= 0]
            if neighbours.size:
                delta = np.abs(np.array([points[index] for index in neighbours]) - candidate)
                delta = np.minimum(delta, size - delta)
                if np.min(delta[:, 0] ** 2 + delta[:, 1] ** 2) < spacing * spacing:
                    continue
            place(candidate)
            placed = True
            break
        if not placed:
            active[slot] = active[-1]
            active.pop()
    return np.array(points)


def worley(size, cells_x, cells_y, rng):
    points_x = (np.arange(cells_x)[None, :] + rng.uniform(0, 1, (cells_y, cells_x))) / cells_x
    points_y = (np.arange(cells_y)[:, None] + rng.uniform(0, 1, (cells_y, cells_x))) / cells_y
    u = (np.arange(size)[None, :] + 0.5) / size * np.ones((size, 1))
    v = (np.arange(size)[:, None] + 0.5) / size * np.ones((1, size))
    column = np.floor(u * cells_x).astype(int)
    row = np.floor(v * cells_y).astype(int)
    nearest = np.full((size, size), np.inf)
    second = np.full((size, size), np.inf)
    owner = np.zeros((size, size), dtype=int)
    for shift_y in (-1, 0, 1):
        for shift_x in (-1, 0, 1):
            other_row = (row + shift_y) % cells_y
            other_column = (column + shift_x) % cells_x
            delta_x = np.abs(points_x[other_row, other_column] - u)
            delta_y = np.abs(points_y[other_row, other_column] - v)
            delta_x = np.minimum(delta_x, 1 - delta_x) * cells_x
            delta_y = np.minimum(delta_y, 1 - delta_y) * cells_y
            distance = np.hypot(delta_x, delta_y)
            closer = distance < nearest
            second = np.where(closer, nearest, np.minimum(second, distance))
            owner = np.where(closer, other_row * cells_x + other_column, owner)
            nearest = np.where(closer, distance, nearest)
    return nearest, second, owner


def normal_map(height, strength):
    slope_u = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    slope_v = (np.roll(height, 1, axis=0) - np.roll(height, -1, axis=0)) * 0.5 * strength
    normal = np.stack([-slope_u, -slope_v, np.ones_like(height)], axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return normal


def encode_normal(normal):
    return np.clip(np.rint((normal * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


def encode_colour(colour):
    return np.clip(np.rint(colour * 255), 0, 255).astype(np.uint8)


def srgb_to_linear(colour):
    return np.where(colour <= 0.04045, colour / 12.92, ((colour + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(colour):
    colour = np.clip(colour, 0, 1)
    return np.where(colour <= 0.0031308, colour * 12.92, 1.055 * colour ** (1 / 2.4) - 0.055)


def levelled(field, mean, deviation, low=0.0, high=1.0):
    result = standardise(field)
    for _ in range(6):
        result = np.clip(result * deviation + mean, low, high)
        result = standardise(result)
    return np.clip(result * deviation + mean, low, high)
