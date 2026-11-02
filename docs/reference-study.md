# Reference study

## Target

Reconstruct the graphics, controls, vehicle physics, speed handling, vehicle
selection, and endless driving experience of <https://slowroads.io/>, including
use after the first load without a network connection.

## Available evidence

The current official site presents a Cloudflare verification screen to both HTTP
requests and a clean browser session in this environment. Its current rendering
and behavior have not been measured.

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

These values now inform the touring car and bus. The present physics model uses
a bicycle approximation with limited lateral grip, rather than the historical
four-wheel suspension solver. Matching constants alone does not establish
matching dynamics. The additional convertible has its own handling profile.

## Graphics measurements and reconstruction

The historical renderer uses a default vertical field of view of 68 degrees.
Its roadster body artifact at
<https://slowxroads.com/static/media/roadster-07.0d45cf64.obj> has longitudinal
bounds of -0.579 to 3.502 meters, lateral bounds of -0.823 to 0.823 meters, and a
roof height of approximately 1.227 meters. The current procedural car body and
chase framing use those proportions. The original mesh is retained only for
local inspection and is not included in the application.

Vegetation now uses locally painted foliage atlases on crossed planes. The
atlas changes with the season, including bare winter branches. The ground has
fine texture and broader color variation, with denser grass near the road and
vertex-based wind movement. Streaming still bounds the number of terrain
sections. Lakeside terrain and a procedural water surface extend the scenery.

These changes close visible gaps against the historical build. They do not prove
matching generation or rendering against the current official release.

## Verified implementation behavior

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
- Replace the approximate suspension and contact model where measurements demand
  independent wheel behavior.
- Match terrain generation, road profiles, horizon detail, ground textures,
  vegetation, and atmospheric rendering more closely. The current foliage atlas,
  grass, water, and material generation require further reference comparison.
- Match vehicle silhouettes, materials, interiors, lights, and the complete
  reference vehicle lineup. A motorcycle and detailed cabin view are pending.
- Verify the full controls, including controller and mouse behavior where the
  current reference supports them. Current implementation covers keyboard and
  touch input.
- Verify extended driving performance, resource bounds, mobile layouts, and
  offline upgrades across repeated releases and browser sessions.

The playable implementation and passing checks are checkpoints. Exact visual and
behavioral fidelity remains unproven.
