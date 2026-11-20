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

## People and animals

Walkers and four of the grazing animals are rigged models by
[Quaternius](https://quaternius.com/), published under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- `src/assets/models/man.glb` and `woman.glb` derive from the Man and Woman Casual
  models, downloaded from [Poly Pizza](https://poly.pizza/m/HMnuH5geEG).
- `src/assets/models/sheep.glb` derives from the Sheep model on
  [Poly Pizza](https://poly.pizza/m/rgJXF570ZK).
- `src/assets/models/cow.glb`, `horse.glb`, and `deer.glb` derive from the
  [Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html)
  pack.

Each file keeps only its walk, idle, and eating clips. Meshes are welded and
quantized with glTF Transform, which brings the six files to about 2 MB together.
Shirt, trouser, and skin materials are recoloured per walker. Goats, camels, and
elephants have no suitable public-domain rigged model and remain generated in code,
as does every figure on software rendering or if a model fails to load.

The files are served from the application and included in its offline cache.
