# Asset sources

The bundled rock surface uses [Rock Face 03](https://polyhaven.com/a/rock_face_03)
by Dario Barresi and Rico Cilliers, published by Poly Haven under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- `src/assets/rock-albedo.jpg` derives from `rock_face_03_diff_1k.jpg`.
- `src/assets/rock-normal.png` derives from `rock_face_03_nor_gl_1k.png`.

Both maps are reduced to 512 by 512 pixels. The color map uses JPEG compression.
The OpenGL normal map is converted to eight-bit PNG with renormalized vectors.
The material tiles over 3.6 meters with world-space color variation. Native
rendering combines two texture scales and normal detail; software rendering
samples one color scale and retains the underlying terrain bump shading.
Three projections blend by surface orientation to avoid stretching
on differently facing slopes. Each normal projection uses its own tangent frame.
Seasonal rock and soil colors tint the photographic surface.

The files are served from the application and included in its offline cache.
The running game makes no requests to Poly Haven.
