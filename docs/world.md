# The looping world

This note records how the world is laid out and which features now go beyond the
reference study in `reference-study.md`.

## Shape

The world is a torus measured in road coordinates. The road is a single line
`x = f(s)`, where `s` runs along the lap and `x` across it.

- It repeats every 12 km along `s`. Road curves, terrain, woodland, roadside
  furniture, and landmarks all wrap their lattice indices, so lap two is the
  same place as lap one. `physics.s` keeps counting, and lap numbers come from it.
- It repeats every 3 km across `x`, measured from the road. When the car passes
  1.5 km from the road it is moved 3 km sideways in the same step. Terrain tiles
  are drawn a second time across the seam so the join is not visible.

Both lengths are whole multiples of the terrain control cells and the 120 m tile.

## Getting back to the road

A drivable route always leads from the road, around the world, and back onto it.
It is not always a straight line: a steep hillside still stops a car driven
straight at it, and guardrails and cut banks close parts of the roadside. Four
rules make the route exist:

- Water is shallow everywhere. Terrain eases onto a bed 0.3 m under the surface,
  so lakes and bays can be forded slowly instead of acting as walls.
- Alpine and canyon landscapes open two gentle passes per lap across the full
  width, because their mountains and mesas otherwise wall the road in.
- On each side of the road, between a fifth and four fifths of the lap has no
  rail and a verge gentle enough to cross. The longest closed stretch measured is
  about 1 km.
- Tests plan a route over the height field for every landscape that leaves an
  open stretch on one side, never climbs more than 35 percent, crosses the side
  seam, and reaches an open stretch on the other side. A simulated pickup then
  drives that route with simple pursuit steering and must end on the pavement
  without touching a barrier.

The minimap shows the terrain, the road and its copies across the seam, an arrow
with distance back to the road, lap progress, and landmarks. The N key opens a map
of the whole loop.

## Beyond the reference

- The gearbox is automatic by default. The manual setting puts the gears on E
  (up) and Q (down), or the scenery buttons on a controller. Each gear pulls
  hardest in the upper half of its revs and stops at a rev limiter, so first
  tops out near its own speed until the driver shifts; a tall gear from rest is
  sluggish; lifting off slows the car on the engine, more in low gears; a
  downshift that would over-rev is refused; reverse sits one click below first at
  a standstill, and the brake holds the car instead of reversing. Shifts cut
  drive for a moment and make a clunk, with exhaust pops on hard upshifts and a
  stutter on the limiter. The gear readout turns amber near the redline and red
  on the limiter. Autodrive always shifts for itself.
- The distance driven adds up across visits in the browser's local storage and
  shows under the trip distance as an all-time total.
- Boost draws from a charge that burns for 7 seconds and refills in 22. While it
  fires it adds drive past the nominal top speed, widens the view, and streaks
  the edges of the frame.
- Rendering on capable hardware goes through an HDR pipeline with bloom, ambient
  occlusion, distance haze, and grading. Slow frames step the resolution down
  before any effect is dropped, and a display that is steadily capped at 30 Hz is
  not treated as slow.
- Landscapes are profiles in `src/game/landscapes.ts`. Forest, canyon, and
  northern lakes were added to highlands, alpine, and desert.
- Skies include dawn, dusk, and a live cycle through a full day every twelve
  minutes. Weather includes a storm with lightning and thunder.
- A pickup, hatchback, and supercar are built from a lofted body generator.
- Laps are timed from line to line. A link encodes landscape, seed, and distance.
  Photo mode freezes the drive and hides the interface.
- The road carries delineator posts, bend chevrons, and a gantry at the lap line.
  Up to eight landmarks per lap can be found.
- Tyres raise dust, smoke, and spray, and leave skid marks when they slide.
- The road wears. One condition map, 2.4 km long and repeated five times a lap,
  holds puddle basins, dirt, pothole damage, and repair patches. The asphalt shader
  and the pavement height both read it, so a pothole that shows is one the
  suspension drops into. The road surface setting chooses freshly laid, well
  travelled (the default), or potholed. Only the potholed road changes the
  pavement height.
- Rain falls as streaks that lean with the car's speed. On capable hardware the
  wet road mirrors the scene in screen space, puddles reflect the sky and carry
  rain rings, and drops gather on the lens.
- Walkers follow the verge by day, alone or in groups of up to seven, and step
  aside for a passing car. Herds chosen for each landscape graze in the fields:
  cows, sheep, horses, deer, goats, camels, and elephants. None are placed on the
  carriageway. People, cows, horses, deer, and sheep are rigged public-domain
  models with walk, run, idle, eating, and falling cycles; the rest are generated
  in code.
- Anyone in the path of a moving car bolts after a short reaction time, so a slow
  car is dodged and a fast one is not. The horn sends everyone within earshot
  running with a shout. A car above walking pace knocks down whoever it reaches
  instead of bouncing off them: they are thrown ahead, stay where they land, and
  bleed, the car loses speed in proportion to their weight, and everyone nearby
  screams and flees before wandering back. Elephants, and anything met at a
  crawl, stay solid.
- Roadside marker posts fold flat and bushes are squashed when the car runs over
  them, each with a small loss of speed and its own sound. Trees, sign posts,
  rails, rock outcrops and landmarks are solid. A struck walker or animal is
  swept clear of the bodywork to the nearer side instead of passing through it.
- Off the road, slopes steeper than about 45 degrees act as walls instead of
  ramps, and foliage closer than the chase camera is cut away so the view never
  fills with leaves.
  The roadside life setting chooses empty, quiet, or lively (the default).
- Waterfalls pour over rock ledges set into steep hillsides that face the road.
  Monsoon Jungle is a seventh landscape of dense broadleaf canopy, leaning palms,
  and ferns.
- The touring car, hatchback, supercar, and pickup wear modelled bodies over the
  generated ones, with the same suspension, steering, and wheel spin driving the
  modelled wheels. See `assets.md` for credits.
- The camera leans into bends, dips under braking, and trembles at speed. The
  camera motion setting turns that off together with speed blur and lens drops.
