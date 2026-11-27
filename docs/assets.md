# Generated assets

Every bundled model and texture in `src/assets/` is original work produced by the
scripts in `tools/assets/`. Nothing is downloaded or derived from outside models,
scans, or photographs. Each group regenerates into its existing paths with one
command run from the repository root.

Requirements: Blender 4.5 on `PATH`, at `~/.local/bin/blender`, or named by
`BLENDER`; Bun for the glTF Transform weld, quantize, and meshopt steps; and, for
textures, Python with numpy and Pillow.

| Group            | Outputs                                                           | Command                                                                                               |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Cars             | `src/assets/models/cars/*.glb`                                    | `python3 tools/assets/cars/generate.py`                                                               |
| Car bodies       | `src/assets/models/cars/bodies/*.glb`                             | `python3 tools/assets/cars/bodies/generate.py`                                                        |
| Car pictures     | `src/assets/models/cars/thumbs/*.webp`                            | `python3 tools/assets/cars/thumbs.py`                                                                 |
| People           | `src/assets/models/man.glb`, `woman.glb`                          | `python3 tools/assets/people/generate.py`                                                             |
| Animals          | `src/assets/models/{sheep,horse,deer,cattle,bull,elephant}.glb`   | `python3 tools/assets/animals/generate.py`                                                            |
| Rocks and plants | `src/assets/models/rocks/*.glb`, `src/assets/models/plants/*.glb` | `python3 tools/assets/vegetation/build.py`                                                            |
| Trees            | `src/assets/trees/*.webp`                                         | `python3 tools/assets/trees/generate.py`                                                              |
| Textures         | `src/assets/rock-*`, `asphalt-*`, `ground-detail.webp`            | `uv run --with-requirements tools/assets/textures/requirements.txt tools/assets/textures/generate.py` |

Most generators accept `--previews <dir>` to render preview images.

## Cars

The touring sedan, roadster, hatchback, supercar, and pickup are lofted bodies,
subdivided and shaded like the catalog bodies below, with cut
wheel arches, glass, lamps, interiors, and separate wheels named `Wheel_FL`,
`Wheel_FR`, `Wheel_RL`, and `Wheel_RR`. The paint material is `body`, and the lamp
meshes are `Headlights` and `Taillights`. The game scales each body to its
vehicle's wheelbase and drives the wheels from the simulated suspension. The
coach and motorcycle are built in code, as is every vehicle on software
rendering, in the bonnet view, or if a model fails to load.

## Car bodies

Each of the 87 real cars in the engine catalog has its own body in
`src/assets/models/cars/bodies/`, named by the car's id (its name in lowercase words,
such as `ferrari-f8-tributo`). `src/game/car-sheets.json` is the one table of real
dimensions behind them: generation, length, width, height, wheelbase, front overhang,
front and rear track, tyre sizes, ground clearance, chassis class and factory paint,
along with its brakes, the wheels it drives (`front`, `rear` or `all`), the share of
its weight over the front wheels in percent, and `slicks` for the race cars. Each row
lists under `estimated` the figures that are estimates instead of published ones;
front overhang, ground clearance and the front weight share are estimates for most
cars.
The generator and the game both read it, so a body's wheels sit exactly where the
physics puts them.

The designs live in `tools/assets/cars/bodies/makers/`, one file per maker. Each is a
short function on the `Coach` kit in `tools/assets/cars/bodies/kit.py`: a lower body
lofted through six lines and subdivided into rounded surfaces with creased feature
lines, a glasshouse, cut wheel arches and recesses, headlamps recessed into cavities
under a clear cover, and tail lamps, grilles and trims projected onto the surface.
Each cut is checked on its own, so a recess that fails is left out and reported.
Ambient occlusion is baked into vertex colours, and number plates carry texture
coordinates so the game can print characters on them. Trim variants share one base function. The three
Formula One cars use the open-wheel builder in `formula.py`. Shapes are drawn from
the sheet's dimensions and from memory of the cars, with no reference meshes, scans or
photographs, and carry no badges or lettering.

`python3 tools/assets/cars/bodies/generate.py --only <id> --previews <dir>` rebuilds
chosen bodies and writes a six-view contact sheet for each. The build prints each
body's length, width and height beside the real figures, and
`src/game/car-bodies.test.ts` holds every model to its sheet: wheel positions and
sizes, overall length and height, the paint material, and the lamp meshes the game
lights. The generator also writes each design's factory paint back into the sheet. Pass
`--flat` to the Blender build to skip the shading bake while iterating.

`tools/assets/cars/thumbs.py` renders every class car and catalog car once as a
small studio picture with neutral paint, plus a mask of its painted panels. The
car picker tints the mask with the chosen paint, so the pictures follow the
paint without rendering anything in the game.

In the game a car's body appears when that car is chosen on its own chassis class.
Its wheelbase, track and wheel sizes replace the class's own; handling stays with the
class. As built, the bonnet view and software rendering keep the class's own body.

## People and animals

Walkers are skinned meshes on a 19-bone skeleton with `Idle`, `Walk`, `Run`, and
`Death` clips. `Shirt`, `Pants`, and `Skin` are recoloured per walker. Every animal
comes from one parametric quadruped with per-species proportions and features,
one vertex-coloured `Coat` material, and `Walk`, `Run`, `Idle`, `Eating`, and
`Death` clips. Goats and camels, and every figure on software rendering, are
built in code.

## Rocks and plants

Rocks and the stump are sculpted, decimated to about 1,500 to 2,000 triangles,
and baked to a 512 pixel albedo and normal map. Plants are grown from tubes and
leaf cards with painted 512 pixel leaf atlases. Wood and leaves use separate
materials so only leaves turn in autumn and leafy plants are left out in winter.
Software rendering leaves them out.

## Trees

The woodland tree cards are orthographic renders of procedurally grown trees,
768 pixels square, with leafless variants for winter. Each tree is lit from
straight overhead by a broad zenith light under a white sky, so a picture holds
leaf colour and the shade inside the crown but no sun direction; the game adds
the sun, the shaded side, and the hue of each tree. Leaf and bark colours are
real surface colours, dark and olive rather than bright. Trunks grow straight so
the crossed cards share one stem. Edge colour is bled under the transparent
pixels, each leafed picture is levelled to a common brightness, and its bare
variant takes the same gain so bark matches between seasons. Bare winter
broadleaf trees and every tree on a failed load are painted in code.

## Textures

Rock, asphalt, and ground detail maps are built from periodic noise, Worley cells,
and Poisson-disk aggregate so they tile without seams. Normals come from height by
wrapped finite differences. The rock albedo mean matches the colour divisor in
`src/game/ground.ts`, and asphalt and ground detail keep the brightness the
shaders expect.
