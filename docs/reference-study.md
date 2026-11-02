# Reference study

## Target

Reconstruct the graphics, controls, vehicle physics, speed handling, vehicle
selection, and endless driving experience of <https://slowroads.io/>, including
use after the first load without a network connection.

Development, verification, and preview stay local at <http://localhost:3002>.
Checkpoint commits are published to GitHub through Pukbot, and Vercel builds the
production site from the main branch. The repository name does not imply
ownership of the similarly named public domain.

## Available evidence

The current official site presents a Cloudflare verification screen to both HTTP
requests and a clean browser session in this environment. Its current rendering
and behavior have not been measured. A fresh Rea capture on November 3, 2026
still ends at that verification screen.

The [official site's indexed changelog](https://slowroads.io/) lists web version
2.4.2, dated June 15, 2026. It records a physics rewrite in 2.1 and functional
dashboards and improved interiors in 2.4, alongside stronger brakes and linear
acceleration input. It also confirms controller and mouse support, additional
autodrive modes, chase-camera orbit and zoom, first-person look-around, and a
minimum grip factor of 0.2. The local grip control now reaches that minimum.
Historical constants remain provisional for current-release handling.

The historical game now loads and drives in an isolated browser session. Its application bundle is hosted at
<https://slowxroads.com/static/js/main.e7a33c55.chunk.js>. This is an older build,
so findings require current-release verification. Reference files and full
analysis artifacts remain untracked and local, outside the shipped application.

Static analysis recorded artifact digest
`5b590f09d12174cbe8d4a6e18c57c58d97940c0e3c0fb4970a3a6336e1b36113`
for the analysis container containing the historical script, and evidence record
`ev_b70bc9623a90437755e95112c5ca5bbdb3551da72524e619764f1cd82a1471ba`.
The digest identifies the analysis container, not the upstream script alone.

The developer's technical case study describes the terrain corridor, custom
wheel physics, distance-based guardrail collision checks, and procedural assets:
<https://web.dev/case-studies/slow-roads>.

## Observed historical behavior

The historical bundle contains a four-wheel dynamics model with independent wheel
contact and suspension state. It computes left and right front steering angles
separately. Throttle force approaches a target at a bounded jerk rate. Braking
builds over 0.25 seconds. Rolling resistance scales with velocity, aerodynamic
drag scales with velocity squared, and steering authority decreases with speed.
Gravity is 9.81 meters per second squared.

| Parameter                       | Historical roadster | Historical coach |
| ------------------------------- | ------------------- | ---------------- |
| Acceleration setting            | 9                   | 6                |
| Reverse setting                 | 5                   | 5                |
| Jerk setting                    | 48                  | 6                |
| Braking setting                 | 8                   | 4                |
| Drag coefficient                | 0.001               | 0.002            |
| Rolling resistance              | 0.06                | 0.03             |
| Nominal speed, m/s              | 45                  | 32               |
| Maximum steering angle, radians | 0.68                | 0.65             |
| Wheelbase, meters               | 2.75                | 5.47             |

These values now inform the touring car and bus. Each wheel has an independent
ground contact, spring and damper, suspension travel, steering angle, and rolling
distance. Spring loads drive chassis heave, pitch, and roll, including loss of
contact, landing, and acceleration weight transfer. Wheel motion in the renderer
uses those states. Wheel-local longitudinal and lateral impulses share a friction
budget based on the wheel's current load and surface. Unloaded wheels cannot
accelerate or steer the chassis. Locked wheels slide against their contact
velocity, and the handbrake locks the rear wheels. Steering speed and acceleration
are vehicle-specific. Autodrive uses a geometric pursuit target.

Mass and suspension travel also come from the historical definitions. Damping
ratios, center-of-mass height, and chassis inertia are reconstructed tuning
values. The solver is an independent implementation and still needs reference
response measurements. Matching constants alone does not establish matching
dynamics. The additional convertible has its own handling profile.

The historical bundle also includes an enclosed two-wheel motorcycle, disabled
in that release's menu. Its wheelbase is 1.95 meters, tire radius is 0.26 meters,
acceleration setting is 11, nominal speed is 53 meters per second, and maximum
steering angle is 0.4 radians. The local motorcycle uses those values, turns with
an inward lean, and has no handbrake. Its pod silhouette is reconstructed from
local inspection of the historical body artifact. The original mesh is not
included in the application.

## Graphics measurements and reconstruction

The historical renderer uses a default vertical field of view of 68 degrees.
Its roadster body artifact at
<https://slowxroads.com/static/media/roadster-07.0d45cf64.obj> has longitudinal
bounds of -0.579 to 3.502 meters, lateral bounds of -0.823 to 0.823 meters, and a
roof height of approximately 1.227 meters. The current procedural car body and
chase framing use those proportions. The original mesh is retained only for
local inspection and is not included in the application.

The historical glazing uses a gray-blue Phong material. The reconstruction uses
physical paint and glazing materials with separate surface properties; matching
their reflection and tint remains visual work. Guardrails have a folded steel
profile with a 0.78-meter upper edge, informed by the historical barrier geometry. Rail sections
and posts are still merged into one draw per terrain section.

Vegetation now uses locally painted foliage atlases on crossed planes. The
atlas changes with the season, including bare winter branches. The ground has
fine texture and broader color variation, with denser grass near the road and
vertex-based wind movement. Streaming still bounds the number of terrain
sections. Lakeside terrain and a procedural water surface extend the scenery.

Ground materials blend a gravel shoulder within roughly 0.7 meters of the road,
exposed rock on steeper faces, and dry meadow patches. Grass blades share the
meadow coloration. A small shared noise texture supplies the blend masks, and
the material colors update with the landscape and season.

These changes close visible gaps against the historical build. They do not prove
matching generation or rendering against the current official release.

The historical terrain generator combines radial controls at several scales.
Its normal profile uses a 3-kilometer cell and resolutions of 3, 12, and 24,
corresponding to 1,000-, 250-, and 125-meter terrain features. The local height
field now uses those scales, signed shaped amplitudes, and a smooth radial
falloff. It is anchored to the road corridor, and barriers follow roadside drops.
The local seed mapping is independently implemented, so equal seed labels do
not yet imply equal terrain in the historical game.

The road now uses seeded smooth control curves with analytic tangents and grades,
instead of repeating trigonometric waves. Landscape profiles change elevation
and grade while retaining smooth joins. Unit checks include negative coordinates,
million-meter positions, and ten minutes of winter bus autodrive across three
seeds without leaving the pavement or hitting a barrier. Routing is still an
approximation of the historical terrain-constrained generator.

## Verified implementation behavior

The local controls now include full autodrive, autosteer, autospeed, adjustable
forward cruise speed, and one-pedal braking. Manual input releases the matching
assisted axis. A browser flow verifies those handoffs and the control settings;
simulation checks verify that one-pedal braking stops without selecting reverse.
The precise current-release response and mappings still require comparison.

The controls review reproduced missed steering handoff during gradual stick
movement. Activity now accumulates from the last accepted position, so slow
deliberate movement releases assistance while unchanged held input does not.
The dynamics review also reproduced road departures at high requested cruise
speeds and low grip. Autodrive now samples local curvature with braking lookahead
and reserves wheel traction for steering. A 216-scenario regression covers all
four vehicles, three grip settings, summer and winter, all landscapes, and three
seeds over three simulated minutes per scenario. Power settings are paired with
seeds, rather than tested as a full cross-product. Those scenarios keep wheels on
pavement and avoid rail impacts without changing the saved cruise preference.

Standard-layout controller input now uses the browser's
[Gamepad API mapping](https://www.w3.org/TR/gamepad/#remapping), polled per frame.
Analog triggers retain pressure values, sticks have an adjustable deadzone,
buttons act on press edges, and disconnect or loss of focus clears driving input.
Unit checks and a browser fixture exercise the input path with synthetic
controller states. Physical controllers and custom device mappings remain
unverified; the browser fixture does not establish hardware compatibility.

Mouse driving now follows horizontal cursor position, with left-click
acceleration and right-click braking and reverse. Its enabled state and sensitivity
are saved locally. Mouse driving overrides controller axes while enabled; keyboard
and touch input remain available. Unit checks cover centering, sensitivity,
button release, and braking priority. The browser flow exercises real mouse
clicks and fixture-generated cursor movement through the canvas input handlers.

- The live TanStack Start development server responds on port 3002.
- Manual driving, autodrive, pause/resume, vehicle and scenery changes render in a
  real Chrome session without page errors in the captured flows.
- Terrain sections are generated deterministically and discarded behind the
  camera. Unit checks cover road continuity at section boundaries and far from
  the origin.
- Automated dynamics checks cover acceleration, coasting, braking, reverse,
  timestep consistency, several kilometers of autodrive, and distinct natural
  cruising limits.
- A production browser capture waited for the offline-ready state, stopped the
  HTTP origin, reloaded the application, and drove without that origin. The
  captured steps completed without page errors.
- The production entry page is statically prerendered. Real-browser checks cover
  hydration errors, shader errors, visible road pixels in bonnet view, keyboard
  button activation, and seasonal vehicle changes.
- Build checks compile the service worker. Automated worker checks cover cached
  navigation, scripts, cache upgrades, and unrelated storage preservation.

## Remaining reconstruction work

Broader visual references for this pass include the official
[Forza Horizon 5 biome study](https://forza.net/news/forza-horizon-5-road-to-mexico-july-update)
and [Assetto Corsa EVO imagery](https://assettocorsa.gg/assetto-corsa-evo/).
The selected principles are layered vegetation, directional light with controlled
ambient fill, weather-dependent visibility, and coherent material reflections.
Their artwork and vehicle assets are kept outside the application.
[BeamNG's spring and damping explanation](https://www.beamng.com/game/about/physics/)
also provides a useful reference for response and energy checks.

The local driving interface now removes branding and decorative messages after
starting. Q/E cycles scenery and seasonal conditions; V and Shift V cycle vehicles.
Weather now changes clouds, fog, precipitation, material reflections, and road
traction. Winter precipitation uses snow. Wet grip is reconstructed tuning, and
both tire response and assisted corner planning use the same surface coefficient.
The lighting review corrected excessive indirect fill and bright fog outlines on
cutout vegetation. Rain uses world-space roughness variation on asphalt.

A further clear-weather comparison found that sky tone mapping and the gameplay
CSS tint muted blue regions into gray. The sky now uses a separate display-color
gradient with broader procedural cloud masses and distant wisps. The welcome
screen retains its text tint; active driving shows the renderer directly.
Night clouds use a dark palette rather than the daytime cloud color. Twelve
daylight/weather combinations rendered without page or console errors, and the
production bonnet and scenery-switch checks passed. These captures support a
historical visual comparison, not current-release fidelity.

The follow-up review caught a distant silhouette band in fog. The sky's lower
hemisphere now converges to the same display color as fully fogged geometry.
A GPU probe compared a distant opaque surface with the adjacent sky horizon
across all twelve daylight/weather states: covered and night cases matched
exactly, while clear day and sunset differed by at most two 8-bit channel values
because a small amount of the surface remains visible through their lighter fog.

Guardrail response now dissipates contact-normal energy and preserves tangential
motion in road coordinates. Gentle contact no longer injects a fixed lateral kick.
A reverse torque governor limits powered reversing while allowing gravity-driven
backward rolling. Flat-grade reversal probes now agree in both orientations.

Service and one-pedal braking now suppress applied engine torque while the
internal drive request continues its jerk-limited transition. This removes the
initial speed increase after braking from powered motion. Twelve regressions
cover all four vehicles with service braking, one-pedal braking, and simultaneous
pedal input. Historical wheel-motion logic also gives braking priority over drive;
current-release response still requires direct comparison.

Brake force now reaches full demand in 0.10 seconds rather than 0.25 seconds.
The historical wheel loop advances a shared brake ramp per wheel, producing
about 0.067 seconds for four wheels and 0.133 seconds for two at 120 Hz. The
reconstruction uses one explicit response time, avoiding wheel-order dependence.
At 20 m/s on an isolated flat road, touring stopping distance decreases from
25.797 to 24.750 meters in clear conditions and from 28.938 to 28.034 meters in
rain. Tire load limits, combined traction, and suspension remain intact. Tests
cover all four vehicles reaching demand and releasing residual force, with equal
touring stopping distances across 30, 60, 120, and 240 FPS through the fixed-step
clock. These measurements isolate local brake response; historical full-vehicle
stopping distances and current-release behavior remain unmeasured.

Direction changes now brake opposing motion and suppress any stale torque that
opposes the requested drive direction. Accelerating reverse cannot gain backward
speed when forward is selected, and selecting reverse near rest cannot add a
forward kick. Eight flat-road regressions and sixteen grade cases cover all four
vehicles, including starting a forward transition from powered reverse.
Generated-road regressions and held-key browser checks also cover the bus's
near-zero contact motion. A 0.05 m/s handoff band prevents tiny solver velocities
from holding the direction-change brake indefinitely while preserving braking
priority and the requested torque direction.

Steering input now retains its source through axis priority and assistance
handoff. Digital steering uses an analytically integrated damped response whose
center-to-full-lock 90 percent times are calibrated to the historical controller
formulas. At rest and at 20 m/s, the targets are 0.729/0.891 seconds for the
tourer, 1.459/1.914 for the bus, and 1.313/1.500 for the motorcycle. The additional
roadster uses its own maximum speed with the tourer's one-second base interval.
These are source-derived historical targets, not current-release measurements or
a claim that every partial input and reversal reproduces the historical state
machine.

Mouse commands instead slew at four normalized units per second and track with
a short analytical response, including targets reached partway through a step.
Analog controls and autodrive retain their existing mechanical response. Source
changes preserve rack angle and velocity; ordinary key release retains the last
source while centering. Speed limits adjust the target without snapping the wheel
angle. Physical rack stops remain enforced across vehicle changes. Tests cover
timing, centering, reversal, 60/120 Hz agreement, source changes, reset, and
manual-to-autosteer recovery. The existing 216 assisted-driving scenarios retain
their original duration and acceptance bounds.

Held-key screenshot review exposed a stationary bus steering wheel despite
correct rack telemetry. The model had read the first suspension wheel, which is
a rear wheel. Instruments now select a front wheel explicitly, and the model
regression steers through the suspension's real front-wheel geometry rather than
assigning a steering value to the rear tire.

The render clock now accumulates up to a quarter second of elapsed time into fixed
120 Hz simulation steps. Driving therefore retains its pace across slower render
frames. A ten-second acceleration check agrees at 8, 15, 30, 60, and 144 rendering
frames per second. Longer stalls are bounded, and focus changes reset residual
time before resuming.

Software renderers now use bounded pixel resolution, shadow buffers, scenery
density, and view distance to prioritize responsiveness. Hardware rendering keeps
its full quality budget. Reflection maps are reused when their actual lighting
and ground colors are unchanged. This addresses interaction stalls reproduced in
the Linux software-rendered browser checks; assertions and individual action deadlines
remain unchanged.

Rain and snow programs are compiled and exercised during the initial preparation
phase. The start controls become available after the first normal frame, keeping
cold precipitation shader work out of scenery-switch input handlers.

The first visual review cycle compared clean 1280 × 720 captures of both builds.
The initial reference attempt was stationary because its keyboard listener needs
focus on the game panel. The retry verified active autodrive and visible movement.
The routes and speeds differ, so these captures support graphics review only.

Review identified coarse asphalt grain, repetitive isolated trees, and stiff grass
as the strongest environment issues. Finer asphalt with anisotropic filtering,
clustered lower shrubs, and denser curved grass addressed those findings. A second
review rejected overly wide grass blades; the next capture verified thinner
strands. The rear fascia, lamp framing, tire visibility, and meadow coverage remain
visible reconstruction gaps. These captures and review records stay local.

A subsequent vehicle pass raised and narrowed the lower shell, integrated a
contoured rear panel, and reduced lamp surrounds. The follow-up captures show
both rear tires and remove the hanging rectangular panel. The review accepted
that improvement while retaining the fascia depth, bottom seam, and overall
body sculpting as further visual work.

The camera now supports chase orbit and zoom, bonnet look-around with smooth
recentering, portrait framing, and a bounded 68-to-76-degree speed field of view.
Those response curves are reconstructed tuning. Camera gestures retain the
current assistance mode, and middle-button movement leaves mouse-driving pedals
available. A real pointer sequence verified looking around while holding the
accelerator. Geometry checks cover near-plane clearance and an intervening
hillside. A full-body view is preserved at the default zoom; the closest zoom
deliberately allows a tighter crop.

Bonnet views now show a vehicle-specific hood or dashboard. Bus and motorcycle
instruments respond to speed, and the bus wheel follows steering. These anchors
are simplified, with detailed cabins still pending. Open tire geometry exposes
the rims and spokes in side views instead of hiding them behind solid black caps.
An independent review accepted the desktop framing, revised portrait scale, and
wheel visibility. Local captures and moving demos document the remaining details.

The foliage atlas now includes evergreen and narrow-crown silhouettes alongside
broadleaf trees and shrubs. Seasonal changes keep species and positions stable;
deciduous crowns lose foliage in winter while evergreens retain their structure.
Global-coordinate grove masks add woodland beyond the road corridor. High detail
uses eight-meter cells, with a stable 24-meter subset in low detail. Placement
rejects water, steep faces, deserts, and exposed alpine peaks. Instances join the
existing species batches, and shared grove coverage shades the understory while
leaving the verge and steep rock clear.

Distant foliage gradually lowers its alpha threshold from 0.46 to 0.28 to retain
canopy coverage through mip levels. Fog remains active. Distant woodland is still
stylized and requires further comparison, especially during side-view movement.

Before the road-cut pass, a ten-second Chrome frame sample on the M4 Pro stayed near 16.7 milliseconds in
both detail modes. The high-detail sample rendered about 1.264 million triangles;
low detail rendered about 356 thousand. Forty section advances, covering 4.8 km,
kept terrain sections bounded at 19 and 13 respectively. Observed geometry maxima
were 141 and 117, with nine textures in both modes. These local samples do not
establish performance on other devices or across a full driving session.

The later environment pass adds a level verge and sharper uphill cuts to the
shared terrain field. Ground vertices and gradient normals use that same field.
Triangle-interior review caught off-road interpolation errors that vertex-only
checks missed. Bank sampling now uses 0.5 m cross-road spacing and 1.25 m along
the road, with 2 m cross-road spacing continuing through the camera's orbit
range. Across 54 meshes and 6,054,912 centroid/edge probes, maximum sampled
height error was 0.06791 m. A separate 2,592-configuration camera audit found
at least 0.29572 m clearance and no blocked camera-to-car centerlines. Permanent
regressions retain a 0.1 m surface limit and 0.2 m camera limit. These are finite
regression bounds, not a proof over every procedural coordinate.

Rock surfaces now combine irregular facets at two scales, with baked unit
normals and albedo packed into one shared mipmapped texture. This adds one
texture to the previous resource budget. Scattered trees and shrubs reject steep
cut faces using the physical surface gradient. Grass thins on exposed uphill
faces, and approximate thin-leaf lighting follows sun color and intensity.
Clumps vary between green and straw colors. Review accepted the clearer sky,
fog convergence, softer grass, and irregular rock relief. Larger ledges,
weathering, and loose material below the continuous bank remain visual work.

Forced software rasterization exposed a substantial cost in the denser terrain.
Its budget now retains the full ground resolution across the car-camera tile
interval plus one tile of padding, while distant tiles use fewer longitudinal
rows. Cross-road boundary topology and gradient normals remain shared. Geometry
upgrades occur after camera placement and before rendering, with old buffers
disposed. Hardware rendering retains its full geometry and vegetation budgets.
Software grass density and pixel resolution are reduced. Native frame samples
remain near 60 FPS on the test M4 Pro; forced SwiftShader samples improved from
roughly 2 FPS to about 6 to 7.5 FPS and remain visibly slower, with occasional
longer stalls. Runtime checks covered signed tile-boundary crossings, portrait
bus orbit, season/quality refreshes, actual mesh clearance, stable geometry on
unchanged frames, and bounded resources. The software browser also passed held
acceleration, bonnet, rain, and assistance checks without rendering errors.

The final production checks pass all ten browser flows and five worker checks,
including reloading and driving after the HTTP origin is unavailable. Local
before/after views and a timestamp-preserving driving recording document this
environment iteration. Current official release fidelity remains unproven.

The latest vehicle pass independently rebuilds the touring and roadster bodies
with lower side sills, genuine wheel openings, dark wheel-well liners and inner
backing, and undertrays. The tail retains a higher lower edge than the sills,
so the rear tires remain visible. Continuous width blends remove the broad
triangular shading bands exposed in the first side-panel capture. The touring
roof and rear glazing are shorter, leaving a distinct boot. The roadster has an
open cockpit with two seats, headrests, a dashboard, console, steering wheel,
shaft, floor, and inner walls. Its steering wheel follows the actual front rack.
Lenses follow the nose and tail profiles, and the wheels have five broad spokes,
open barrels, rim lips, and brake discs. All application geometry remains generated
locally; historical inspection assets stay ignored and outside the shipped build.

New geometry checks exercise both wheelbases through positive and negative full
lock and all suspension-travel endpoints. Rays from the exposed tire surface
must reach the camera side without crossing paint, liners, trays, or cabin parts.
Separate rear-view rays protect tire visibility, downward cockpit rays verify
both the opening and interior coverage, and front/rear rays verify visible lamp
lenses. Existing near-plane, portrait, bonnet visibility, unit-normal, and resource
disposal checks remain intact. The full local gate passes 249 tests, followed by
ten production browser flows and five offline worker checks, including driving
after the origin shuts down. Fixed-camera before/after captures and independent
review caught and removed bright well interiors and hanging backing strips.
The nose and tail remain boxier than the historical reference, glazing and
interior treatment remain simple, and broader current-release fidelity is unproven.

Ten-second driving samples of each updated car at high and low detail retained
a 16.7 ms median and a 16.7 to 16.8 ms 95th percentile on the test M4 Pro at
1280 by 720. Five cycles through all four vehicles held per-vehicle geometry,
texture, and shader-program counts stable after warmup. These finite samples
cover the added vehicle cost on that renderer, not performance on other devices.

Static untextured coachwork, interior parts, and wheel components are batched
by material after construction. Animated wheel pivots and the exterior steering
wheel retain independent ownership. Batching preserves world-space vertices and
normals under transformed parents, leaves shared live geometry allocated, and
disposes replaced buffers. Fixed-view pixel comparisons before and after batching
differ by at most four pixels above a two-channel-value threshold per 1280 by 720
image across ten views. Model disposal is checked exactly once per live resource.
Touring exterior meshes decrease from 140 to 21 and roadster meshes from 134 to
21, without changing their 24,888 and 22,044 triangle counts. The latest native
samples remain near 60 FPS. Forced software rendering still takes approximately
167 to 217 ms per median frame, with longer stalls, despite fewer draw submissions.
That renderer remains a performance limitation rather than a completed target.
Reviewing the encoded drive also exposed a brief empty notification background
after the vehicle-change text cleared. Empty notifications now stop their fade
immediately while the live status element remains available. The fresh recording
checks the first empty state for zero opacity and no active transition.

Native shadows now use a smaller depth and normal bias with tighter filtering,
keeping contact closer to the tires without an extra shadow pass or fake contact
plane. The existing map sizes and full environment coverage remain intact.
Touring glazing has a neutral tint and independent reflection strength; lighting
changes preserve the separate paint and glass settings. Glass receives shadows
without casting an opaque pane shadow, avoiding the heading-dependent artifacts
seen in backface-only experiments. This remains a glazing approximation.

Twenty-six frozen captures of the actual engine cover both detail levels, both
headings, banked and airborne positions, all four vehicles, sunset, winter fog,
and night rain. Independent review found no pane checkerboarding or new visible
paint or terrain acne. The smaller low-detail map remains visibly coarser.
A fresh 20.53-second encoded drive covers touring, a roadster change, orbit, and
camera return. Ten-second native samples for both cars and detail levels retain
a 16.7 ms median and 16.7 to 16.8 ms 95th percentile on the test M4 Pro, with
bounded resources across five vehicle cycles. Software-renderer performance and
cross-route terrain or handling fidelity remain open limitations.

Completion requires current evidence for the full requested fidelity:

- Inspect the current official game after browser verification is available.
- Measure and compare acceleration, braking distance, steering response, grip,
  reverse, suspension, and behavior at high speed against the reference.
- Verify wheel-local traction, suspension response, weight transfer, and locked
  braking against reference measurements.
- Match terrain generation, road profiles, horizon detail, ground textures,
  vegetation, and atmospheric rendering more closely. The current foliage atlas,
  grass, water, and material generation require further reference comparison.
- Match vehicle silhouettes, materials, interiors, lights, and the complete
  reference vehicle lineup. A detailed cabin view is pending; the local selection
  now includes the touring car, convertible, enclosed motorcycle, and bus.
- Implement custom controller mappings and reverse cruise. Compare
  the reconstructed assistance modes and one-pedal response with the current game.
- Verify extended driving performance, resource bounds, mobile layouts, and
  offline upgrades across repeated releases and browser sessions.

The playable implementation and passing checks are checkpoints. Exact visual and
behavioral fidelity remains unproven.
