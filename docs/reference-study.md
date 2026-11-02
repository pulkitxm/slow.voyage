# Reference study

## Target

Reconstruct the graphics, controls, vehicle physics, speed handling, vehicle
selection, and endless driving experience of <https://slowroads.io/>, including
use after the first load without a network connection.

Development and preview stay local at <http://localhost:3002>. The repository
name does not imply ownership of the similarly named public domain.

## Available evidence

The current official site presents a Cloudflare verification screen to both HTTP
requests and a clean browser session in this environment. Its current rendering
and behavior have not been measured.

The [official site's indexed changelog](https://slowroads.io/) lists web version
2.4.2, dated June 15, 2026. It records a physics rewrite in 2.1 and functional
dashboards and improved interiors in 2.4, alongside stronger brakes and linear
acceleration input. It also confirms controller and mouse support, additional
autodrive modes, chase-camera orbit and zoom, first-person look-around, and a
minimum grip factor of 0.2. The local grip control now reaches that minimum.
Historical constants remain provisional for current-release handling.

The historical game now loads and drives in an isolated browser session. Its application bundle is hosted at
<https://slowxroads.com/static/js/main.e7a33c55.chunk.js>. This is an older build,
so findings require current-release verification. The reference files and full
analysis artifacts are retained outside the source repository.

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

Vehicle glazing uses the historical gray-blue Phong material, and paint uses
nonmetallic roughness of 0.5. Guardrails now have a folded steel profile with a
0.78-meter upper edge, informed by the historical barrier geometry. Rail sections
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
- Implement and verify mouse and controller input, reverse cruise, chase orbit
  and zoom, speed-dependent field of view, and first-person look-around. Compare
  the reconstructed assistance modes and one-pedal response with the current game.
- Verify extended driving performance, resource bounds, mobile layouts, and
  offline upgrades across repeated releases and browser sessions.

The playable implementation and passing checks are checkpoints. Exact visual and
behavioral fidelity remains unproven.
