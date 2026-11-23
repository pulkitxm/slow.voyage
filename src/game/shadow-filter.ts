import { ShaderChunk } from 'three'

export const shadowPlane = { limit: 0.006, footprint: 1 }

const sample =
  /texture\( shadowMap, vec3\( shadowCoord\.xy \+ (vogelDiskSample\( \d, 5, phi \) \* radius), shadowCoord\.z \) \)/g

const helper = /* glsl */ `
		float planeShadow( sampler2DShadow shadowMap, vec3 shadowCoord, vec2 reach, vec2 planeSlope, float planeLift ) {

			float planeDepth = clamp( dot( reach, planeSlope ), - ${shadowPlane.limit.toFixed(4)}, ${shadowPlane.limit.toFixed(4)} );

			#ifdef USE_REVERSED_DEPTH_BUFFER

				return texture( shadowMap, vec3( shadowCoord.xy + reach, shadowCoord.z + planeDepth + planeLift ) );

			#else

				return texture( shadowMap, vec3( shadowCoord.xy + reach, shadowCoord.z + planeDepth - planeLift ) );

			#endif

		}

`

const fit = /* glsl */ `
			vec3 planeAcross = dFdx( shadowCoord.xyz );
			vec3 planeDown = dFdy( shadowCoord.xyz );
			float planeArea = planeAcross.x * planeDown.y - planeAcross.y * planeDown.x;
			vec2 planeSlope = abs( planeArea ) > 1e-14
				? vec2( planeDown.y * planeAcross.z - planeAcross.y * planeDown.z, planeAcross.x * planeDown.z - planeDown.x * planeAcross.z ) / planeArea
				: vec2( 0.0 );
			float planeLift = min( ( abs( planeSlope.x ) + abs( planeSlope.y ) ) * ${shadowPlane.footprint.toFixed(1)} / max( shadowMapSize.x, shadowMapSize.y ), ${shadowPlane.limit.toFixed(4)} );
`

export function planeSlope(across: [number, number, number], down: [number, number, number]) {
  const area = across[0] * down[1] - across[1] * down[0]
  if (Math.abs(area) <= 1e-14) return [0, 0] as const
  return [
    (down[1] * across[2] - across[1] * down[2]) / area,
    (across[0] * down[2] - down[0] * across[2]) / area,
  ] as const
}

export function planeFittedShadows(chunk: string) {
  const opening = 'float getShadow( sampler2DShadow shadowMap'
  const start = chunk.indexOf(opening)
  const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', start)
  if (start < 0 || end < 0 || chunk.includes('planeShadow')) return chunk
  const anchor = 'bool frustumTest = inFrustum && shadowCoord.z <= 1.0;'
  const filter = chunk.slice(start, end)
  if (!filter.includes(anchor) || !sample.test(filter)) return chunk
  sample.lastIndex = 0
  const fitted = filter
    .replace(anchor, `${anchor}\n${fit}`)
    .replace(sample, 'planeShadow( shadowMap, shadowCoord.xyz, $1, planeSlope, planeLift )')
  return `${chunk.slice(0, start)}${helper}\n\t\t${fitted}${chunk.slice(end)}`
}

export function fitShadowsToSurfaces() {
  ShaderChunk.shadowmap_pars_fragment = planeFittedShadows(ShaderChunk.shadowmap_pars_fragment)
}
