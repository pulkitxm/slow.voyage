# The endless world

This note records how the world is laid out and which features it offers.

## Shape

The world has no edges and never repeats. Positions are measured in road
coordinates: `s` runs along the road and `x` across it, and the road is a single
line `x = f(s)` that keeps going.

- Road curves, terrain, woodland, meadow grass, roadside life, landmarks and
  waterfalls are all read from lattices indexed by position. No index wraps, so
  no stretch of road or countryside comes round again, along the road or away
  from it.
- Landmarks are placed one per 1.5 km of road and waterfalls per 12 km stretch,
  each generated when that part of the road is first reached.

## What is drawn

Three layers follow the car and everything behind it is released.

- The road corridor is built in 120 m sections that reach 26 m to either side
  of the centre line: 4 sections behind the car and 14 ahead. Each holds the
  fitted ground, the asphalt, markings, rails, posts, signs, roadside trees,
  rocks, plants and grass. Sections that fall out of range are removed and
  their buffers freed.
- Open ground beyond the corridor is a quadtree of square chunks around the
  car, out to 2.6 km in every direction (`src/game/open-grid.ts`,
  `src/game/open-ground.ts`). Chunks are 64 m across with 2 m cells under the
  car and double in size four times with distance, up to 1 km across with 32 m
  cells. A chunk is replaced by finer or coarser ones only once those are
  built, so the ground never shows a hole, and chunks that are no longer wanted
  are dropped after a moment.
- Woodland uses the same scheme with 256 m chunks out to 1.5 km
  (`src/game/open-scenery.ts`), so forests cover every hillside and not only
  the roadside. Near chunks carry every tree, the next ring a third and the
  outer ring a ninth, always the same trees. Within 150 m trees are full crowns
  that cast shadows and can be hit; further out each chunk is one draw of flat
  tree cards. Between the groves the same chunks scatter lone trees and, close
  to the car, shrubs, in the proportions each landscape uses beside its road.

On a software renderer open ground reaches 1.7 km with less detail in the
middle distance and woodland reaches 600 m.

The tyres read the same triangles that are drawn: the fitted grid inside the
corridor and the 2 m grid outside it.

## Leaving the road

The car can be driven off the road in any direction for as long as the driver
likes. Three rules keep the country open:

- Water is shallow everywhere. Terrain eases onto a bed 0.3 m under the surface,
  so lakes and bays can be forded slowly instead of acting as walls.
- Alpine and canyon landscapes open a gentle pass about every 6 km along the
  road, because their mountains and mesas otherwise wall the road in.
- Tests flood the height field for every landscape from the road outwards and
  plan a route that leaves an open stretch of verge, never climbs more than
  20 percent and reaches 600 m from the road. A simulated pickup then drives
  that route out and back with simple pursuit steering and must end on the
  pavement without touching a barrier.

The minimap looks 1.6 km ahead and shows the terrain, the road, landmarks, and
an arrow with the distance back to the road whenever the car has left it. Past
120 m from the road a pointer at the top of the screen turns toward the road
and counts the distance back.

Grass and sand slow a car less than they used to until it nears the calm speed
that rough ground allows, about 70 to 95 km/h on grass depending on the
vehicle, and then resist steeply.

## Features

- The gearbox is automatic by default. The manual setting puts the gears on E
  (up) and Q (down), or the scenery buttons on a controller. Each gear pulls
  hardest in the upper half of its revs and stops at a rev limiter, so first
  tops out near its own speed until the driver shifts. Second can pull away from
  rest, but a taller gear lugs: the revs sag below idle, the car shudders, third
  barely crawls and top gear will not move the car. Lifting off slows the car on
  the engine, more in low gears. Off the throttle every shift is accepted, even
  in quick succession; under power a downshift that would over-rev is refused.
  Reverse sits one click below first and engages while rolling below about
  25 km/h off the throttle. Holding the brake through a stop drops into reverse
  and holding the throttle at a standstill in reverse selects first, so S always
  brakes then reverses and W always brakes then drives, as in automatic. Shifts cut
  drive for a moment and make a clunk, with exhaust pops on hard upshifts and a
  stutter on the limiter. The gear readout turns amber near the redline and red
  on the limiter. Autodrive always shifts for itself.
- The road has three shapes, chosen in the Journey settings. Winding Roads adds
  broad sweeps, medium curves and tight bends. Endless Straight removes all
  three, so the road keeps one heading while terrain, woodland, water and
  landmarks still vary along the way. Calm Drive keeps a gentler broad sweep
  with a touch of the medium curve, for bends no tighter than about 600 m, and
  halves the walkers. Rails, delineators, landmarks, waterfalls, the minimap
  and autodrive all follow whichever road is chosen, and the
  world is rebuilt when the mode changes.
- When autodrive is switched off and nobody is driving, it keeps the car in
  its lane while it coasts. Once the driver takes a pedal the wheel is held
  for half a second and eased back to centre over about a second more. Any
  steering input, a reset or coming to a stop ends the handover at once.
  Without it a car leaving autodrive on a bend was off the tarmac within two
  seconds.
- Keyboard steering is free by default. A key asks for one and a half times the
  grip angle straight away (three times on the motorcycle) and the rack moves as
  quickly at top speed as at a crawl, so cornering builds as fast on the
  motorway as it does in town while a quick tap still stays in its lane. Light
  and strong steering assists are options: above town speeds a key first asks
  for a small share of the grip angle and the share grows over about a second of
  holding, so a 0.15 s tap moves the car a quarter metre.
- Each vehicle drives the wheels its real counterpart would. Every real car
  carries its own layout, so a Ferrari F8 drives the rear, a Golf GTI the front
  and a Skyline GT-R all four. The generic grand tourer, roadster, motorcycle
  and bus drive the rear, the city hatchback the front, and the supercar and
  trail pickup all four. Power reaches only the driven wheels, and how much they
  can put down follows the real car's weight over them, its wider rear tyres
  and racing slicks, so a mid-engined car launches harder than a front-heavy
  muscle car. A two-wheel-drive car still runs out of traction sooner on a wet
  launch, in sand or on an icy climb, where it can stall on a pass a
  four-wheel-drive climbs. At speed the driven tyres only carry the push beyond
  the air's drag, so every car still reaches its real top speed.
- Driver aids sit in the Controls settings and all start on. Antilock brakes keep
  every wheel just short of locking, so a full stop still steers. Brake force
  distribution shares the braking between the wheels by the weight each one
  carries. Traction control eases the power when a driven wheel starts to spin
  and holds it just under its grip, so the tyres keep some sideways grip and a
  launch stays straight, even through standing water.
  The service brakes are stronger than the tyres, so without antilock a firm
  stop locks the wheels: the car slides straight on, leaves black marks and
  needs about a quarter more road when dry and half as much again in the rain,
  and stability control cannot help while a wheel is locked. Without brake force
  distribution the brakes split at a fixed ratio with a valve that holds the
  rear well back, so stops take about a tenth longer and the fronts lock first.
  Without traction control the driven wheels spin up, smoke and lose their
  sideways grip: stability control then lets a rear drive car swing its tail
  about 20 to 25 degrees before catching it, and a front drive car runs wide.
  Autodrive feathers the throttle when a wheel spins. Stability control always
  stays on. Amber lamps above the speed flash ABS, TCS or ESC while an aid works
  and show OFF for an aid that is switched off.
- The distance driven adds up across visits in the browser's local storage and
  shows under the trip distance as an all-time total.
- Boost draws from a charge that burns for 7 seconds and refills in 22. While it
  fires it adds drive past the nominal top speed, widens the view, and streaks
  the edges of the frame.
- Rendering on capable hardware goes through an HDR pipeline with bloom, ambient
  occlusion, distance haze, and grading. Slow frames step the resolution down
  before any effect is dropped, and a display that is steadily capped at 30 Hz is
  not treated as slow. Stalls while scenery, season, light or vehicle change are
  not counted, one long stall counts as a single short frame, and a lowered
  resolution steps back up after a long run of smooth frames.
- Detail has three levels. Ultra, the default where the hardware allows it,
  renders the same scene through `src/game/ultra.ts`: an HDR target, half
  resolution ambient occlusion, bloom from highlights brighter than the scene
  white, the film curve from `src/game/film.ts` that every quality level shares,
  a soft vignette, and morphological antialiasing on top of multisampling. The
  sky is drawn in scene light and developed on the same film, so the sun rolls
  off to white and distance fog meets the horizon exactly. The speed streaks, lens drops, wet road mirror, and
  distance haze are kept. A device gets Ultra when it supports float colour
  buffers, four sample multisampling, and 8192 pixel textures, and when a few
  timed frames at load finish inside the budget.
- Ultra is held to 60 frames a second by `src/game/governor.ts`. Where the
  browser offers timer queries it reads the time the graphics card spends on
  each frame, so stalls on the processor are never blamed on the picture.
  Elsewhere it watches the rolling median and the slowest tenth of the last 30
  frame intervals. When a frame costs more than four fifths of the budget it
  lowers the 3D resolution in steps down to 0.6 of the display, then drops
  ambient occlusion, then bloom, and finally moves the preference to Full
  beauty with a short crossfade. Headroom wins everything back in the reverse
  order, and a raise that brings the strain back doubles the wait before the
  next try. Without timer queries a display capped at 30 Hz is tested once at
  the lowest cost and then left at full quality.
- `bun scripts/frame-times.ts 20 --angle=vulkan` drives on autodrive at
  1600 by 900 and prints the median and 95th percentile frame time for Full
  beauty and Ultra. Add `--uncapped` to lift the display pacing and see the
  real cost of a frame. In development `voyage.frameBudget()` in the console
  returns the current level, render scale, shed effects, frame times, and
  graphics card time.
- Landscapes are profiles in `src/game/landscapes.ts`. Forest, canyon, and
  northern lakes were added to highlands, alpine, and desert.
- Skies include dawn, dusk, and a live cycle through a full day every twelve
  minutes. Weather includes a storm with lightning and thunder.
- A pickup, hatchback, and supercar are built from a lofted body generator.
- A link encodes landscape, seed, and distance along the road.
  Photo mode freezes the drive and hides the interface.
- The road carries delineator posts and bend chevrons. A landmark stands
  about every 1.5 km and is counted when the car comes close.
- Tyres raise dust, smoke, and spray, and leave skid marks when they slide.
  `src/game/particles.ts` is one pooled, instanced particle draw whose motion,
  drag, wind drift, gravity, and bounce run in the vertex shader, so the
  processor only writes new particles. `src/game/effects.ts` decides what each
  wheel throws: lit, billowing smoke from wheelspin, handbrake slides and
  lock-ups on dry asphalt; dust tinted by the landscape and the gravel verge,
  growing with speed, thin on grass and absent on wet ground; rain spray on
  wet roads; and spark streaks that bounce off the road when the body scrapes
  or hits a guardrail or rock face. Spray starts at the back of each contact
  patch, heavier from the rear tyres than the front, with nothing at walking
  pace and the most at highway speed. Fine mist is kicked up and back, drawn
  smeared along its own motion while young, then slows, widens, thins, drifts
  with the wind, and is gone within a second and a half. It takes the colour
  of the horizon haze, so it is pale by day and dim at night. Droplets are
  thin short streaks that fly only at speed and stay near the tyre. Standing
  water throws more of both and fans the droplets out sideways.
  Ultra keeps 4096 particles, Full beauty 1536 at a lower emission rate, and
  Easy on the engine and software rendering none.
- Headlights come on at night, at dusk, and in fog, rain, or snow.
  `src/game/lamps.ts` adds glowing head and tail lamp halos at every detail
  level, with brighter brake lights. Full beauty adds flat beam sprites and
  Ultra soft volumetric beam cones, both thickened by fog and rain. Smoke,
  dust, and spray are lit by the low beams, and tinted red by the tail lamps
  only within about a metre of them.
- The dark patch under each vehicle is draped over the ground it stands on,
  sampled from the same surface the tyres touch, so it follows banks and bumps
  off the road instead of tilting with the body, and it fades when the car
  leaves the ground.
- The road wears. One condition map, 2.4 km long and repeated along the road,
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
  carriageway. People and every grazing animal except goats and camels are
  rigged models generated by `tools/assets/`, with walk, run, idle, eating, and
  falling cycles. Goats and camels are generated in code.
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
- A car that brushes a guardrail, rock wall or deep water edge at a shallow
  angle is turned along it and slightly away, keeping most of its speed, so it
  never rides the rail. The sloping end piece of each rail run is solid as well,
  so a car sliding off the last segment is caught instead of passing through.
  Every impact takes speed in proportion to how squarely it is met: a brush
  keeps nearly all of it, a quarter radian strike loses a fifth or more.
  never rides the rail.
- Every sound is synthesised in code, with no recordings. Each engine is
  modelled from its layout: a cross-plane V8 in the tourer, a straight-six in
  the roadster, a turbocharged four in the hatchback, a V12 in the supercar, a
  pushrod V8 in the pickup, a 270 degree twin in the motorcycle and a
  turbo-diesel six in the coach. Every cylinder fires its own exhaust pulse in
  firing order, shaped by throttle and load and varying a little from cycle to
  cycle, into tuned exhaust pipes, a muffler and body resonances, so the firing
  frequency always equals the cylinder count times half the crank speed. Intake
  roar, valve gear, diesel clatter, driveline whine and turbo whistle are a
  separate engine-bay voice: the chase camera hears mostly exhaust, the bonnet
  camera mostly intake and machinery through a muffling cabin. The limiter
  cuts the engine in bursts, sporty engines crackle and pop on the overrun, and
  boosted engines vent when the driver lifts.
- Tyres roll with a spectrum set by speed and surface (dry or wet tarmac,
  gravel, grass, sand), scrub before they squeal, squeal on the side that
  slides with a pitch that wanders and roughens as the slide deepens, and skid
  lower when a wheel locks. Gravel throws grains and pinging stones, the
  suspension thumps over bumps and landings, and road joints tick at a fixed
  spacing under the front then the rear axle.
- Wind is turbulent and gusts, rain hisses outside and drums on glass and roof,
  and the land answers through three generated impulse responses, open ground,
  rock cutting and forest, mixed by what surrounds the car. Birds sing by day,
  insects chirp at dusk, cicadas buzz in hot country, water laps or breaks on
  nearby shores and waterfalls rush as they pass. Voices of walkers shift in
  pitch as the car passes them, and the horn returns as a shifted echo.
- The continuous voices run in an audio worklet off the main thread, with a
  main thread fallback where worklets are unavailable, and a compressor and
  limiter keep the mix from clipping.
- Each walker shouts and screams in their own voice: men lower, rougher and
  with darker vowels, women higher and brighter.
- Off the road, slopes steeper than about 45 degrees act as walls instead of
  ramps, and a tree or bush whose crown the camera is inside or about to enter
  is hidden whole, so the view never fills with leaves or dissolves into dots.
  The roadside life setting chooses empty, quiet, or lively (the default).
- Grass tufts growing under a tree crown are darkened with the pool of shade
  drawn on the ground there, a little more than the ground itself.
- Grass tufts take the shade they stand in: the extra glow that keeps blades
  bright in sunlight is held back under trees and in the shadow of hills.
- Soft shadows follow the slope of whatever they fall on, and the offset that
  keeps a surface from shading itself grows with the size of a shadow texel, so
  bodywork, rocks and trunks stay clean instead of showing a stippled hatch.
- Grazing animals walk real curved paths between resting spots at a walking
  pace, turning as they go, and stand still in between. The legs of every
  modelled walker and animal turn over at the rate the ground actually passes,
  measured from each model's own walk and run cycles, so nobody steps on the
  spot or slides. Cattle hurry away from a horn at a fast walk instead of a
  gallop their models cannot show. Anyone running from the car is paced and
  turned by the ground they actually covered since the last frame.
- Walkers turn round at the end of their stretch on a small walked arc and come
  back a step further from the road, instead of flipping on the spot.
- Modelled walkers and animals darken with the canopy shade they stand in, by
  the same pools of shade that are drawn on the ground under each tree, so an
  elephant under the trees no longer looks lit from within.
- The pool of shade drawn on the ground under each tree fades out smoothly
  from its middle, the same way the shade on animals and grass does. It used
  to end in a hard straight edge.
- The soft shade under every walker and animal lies along the slope they stand
  on, so it no longer floats off a bank on one side and sinks into it on the
  other.
- Open ground is not one green: broad patches run from dry and warm to lush and
  cool, worn spots show bare earth on gentle slopes, and the colour is a little
  less saturated than before.
- Woodland trees wear pictures of generated firs, broadleaf trees and
  bushes on their crossed cards instead of painted shapes. Leaves turn from
  yellow to rust in autumn and conifers carry snow in winter. Bare winter
  trees and bushes are pictures of the same trees with their leaves taken
  off, so they keep the real trunk and twig structure and line up with their
  summer shape, with a light dusting of snow along the top of each branch.
  They load only when the season is winter.
- Each tree crown also holds six to ten smaller leaf clusters cut from the
  same picture, set inside the crown and facing outward all round, so a tree
  seen up close has depth and shifts as the car passes instead of reading as
  two flat sheets. A card that is seen edge on is hidden, which removes the
  thin vertical sliver that used to run through every tree. The clusters cast
  no shadow of their own and are left out on a software renderer and on bare
  winter trees.
- Bodywork reflects a sky with drifting cloud shapes and a ragged line of
  distant hills instead of a plain gradient, so paint shows moving highlights
  as the car turns. Window glass takes the same reflection much more strongly
  and stays see-through, and lamp lenses keep a faint glow by day.
- On a software renderer the picture gives way before the simulation does:
  textures skip anisotropic filtering, the ground drops its bump and close
  detail lookups, and the render resolution steps down whenever frames take
  longer than a quarter of a second, the point past which the simulation would
  fall behind real time. It steps back up only when there is headroom.
- The gravel verge has a ragged, mottled edge that fades into soil, and the
  first line of grass beside the road wanders in and out instead of running
  ruler straight.
- While the settings or help panel is open and nothing in the scene is
  changing, a software renderer redraws only every 0.4 s, and at once after a
  resize or a settings change, so clicks in the panel register in a fraction
  of a second instead of about two. A vehicle arriving still draws every
  frame and its arrival runs in real time however slow the frames are, and a
  world rebuild gets a larger share of each paced frame so it finishes in a
  few seconds.
- The printed speedometer face on a software renderer is drawn from the first
  frame after a vehicle arrives instead of waiting until the camera settles
  on it, so its texture never loads late.
- Changing the journey no longer freezes a software renderer. There the tree
  atlas is a ninth of the pixels, the sky reflection map is built once and only
  scaled in brightness afterwards, rebuilt ground tiles stream in under the veil
  instead of all in one frame, and the veil starts to lift after one drawn
  frame and a short wait instead of three slow frames.
- Rock on banks and cliffs is drawn from the one facing that suits each slope
  instead of two blended together, so road cuts show strata and cracks rather
  than a smear.
- Water far from the car mirrors sky from a little above the horizon and keeps
  part of its own colour, so distant lakes read as blue water instead of a
  white sheet.
- Palm trunks are round columns with ring scars and a flared foot instead of
  flat facets, and the tint that colours a landscape's leaves leaves bark its
  own brown, so jungle trunks no longer turn leaf green.
- Firs stand at the proportions of the photographed tree instead of being
  squeezed into narrow cones, and they keep their own dark green in landscapes
  that warm the colour of their leaves.
- Generated shrubs, bushes, desert scrub and jungle plants grow beside the
  road in the landscapes they belong to, close to their real size. They can be
  driven through, leafy ones turn in autumn and are left out in winter.
- Generated boulders are scattered beside the road in every landscape, most
  thickly in the canyon, alpine and fjord country. They are solid.
- Waterfalls pour over rock ledges set into steep hillsides that face the road.
  Monsoon Jungle is a seventh landscape of dense broadleaf canopy, leaning palms,
  and ferns.
- Switching vehicle keeps the current one on screen until the next is loaded
  and its shaders are compiled, then cross-fades to it while the camera glides
  to the new distance.
- Pausing or opening the photo view freezes the camera: crash and speed shake
  stop instead of vibrating behind the menu.
- The touring car, hatchback, supercar, and pickup wear modelled bodies over the
  generated ones, with the same suspension, steering, and wheel spin driving the
  modelled wheels. See `assets.md`.
- The camera leans into bends, dips under braking, and trembles at speed. The
  camera motion setting turns that off together with speed blur and lens drops.
