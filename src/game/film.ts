import { type Color, ShaderChunk } from 'three'

export const filmLook = {
  exposure: 1.2,
  contrast: 1.2,
  linearStart: 0.22,
  linearLength: 0.22,
  toe: 1.45,
  inset: 0.97,
  shadowSaturation: 0.85,
  shadowReach: 0.02,
}

function smoothstep(from: number, to: number, value: number) {
  const amount = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return amount * amount * (3 - 2 * amount)
}

export function filmCurve(value: number, look = filmLook) {
  const { contrast, linearStart, linearLength, toe } = look
  const run = ((1 - linearStart) * linearLength) / contrast
  const shoulderStart = linearStart + run
  const shoulderLevel = linearStart + contrast * run
  const fall = contrast / (1 - shoulderLevel)
  const low = 1 - smoothstep(0, linearStart, value)
  const high = value >= shoulderStart ? 1 : 0
  const curved = linearStart * (Math.max(value, 0) / linearStart) ** toe
  const straight = linearStart + contrast * (value - linearStart)
  const rolled = 1 - (1 - shoulderLevel) * Math.exp(-fall * (value - shoulderStart))
  return curved * low + straight * (1 - low - high) + rolled * high
}

const luma = (red: number, green: number, blue: number) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue

export type Triple = [red: number, green: number, blue: number]

export function filmDevelop(color: Triple, exposure = 1, look = filmLook): Triple {
  const gain = exposure * look.exposure
  const level = luma(color[0], color[1], color[2]) * gain
  const mapped = color.map((channel) =>
    filmCurve(level + (channel * gain - level) * look.inset, look),
  ) as Triple
  const tone = luma(...mapped)
  const keep =
    look.shadowSaturation + (1 - look.shadowSaturation) * smoothstep(0, look.shadowReach, tone)
  return mapped.map((channel) => Math.min(1, Math.max(0, tone + (channel - tone) * keep))) as Triple
}

export const filmCeiling = 0.97

function curveSource(shown: number, look: typeof filmLook) {
  const target = Math.min(Math.max(shown, 0), filmCeiling)
  let low = 0
  let high = 16
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2
    if (filmCurve(middle, look) < target) low = middle
    else high = middle
  }
  return (low + high) / 2
}

export function filmUndevelop(shown: Triple, exposure = 1, look = filmLook): Triple {
  const tone = luma(...shown)
  const keep =
    look.shadowSaturation + (1 - look.shadowSaturation) * smoothstep(0, look.shadowReach, tone)
  const mapped = shown.map((channel) => tone + (channel - tone) / keep) as Triple
  const curved = mapped.map((channel) => curveSource(channel, look)) as Triple
  const level = luma(...curved)
  const gain = exposure * look.exposure
  return curved.map((channel) =>
    Math.max(0, (level + (channel - level) / look.inset) / gain),
  ) as Triple
}

export function undevelop(color: Color, exposure: number) {
  const [red, green, blue] = filmUndevelop([color.r, color.g, color.b], exposure)
  return color.setRGB(red, green, blue)
}

const number = (value: number) => value.toFixed(4)

export const filmChunk = `
vec3 filmCurve( vec3 value ) {

	const float contrast = ${number(filmLook.contrast)};
	const float linearStart = ${number(filmLook.linearStart)};
	const float run = ${number(((1 - filmLook.linearStart) * filmLook.linearLength) / filmLook.contrast)};
	const float shoulderStart = linearStart + run;
	const float shoulderLevel = linearStart + contrast * run;
	const float fall = contrast / ( 1.0 - shoulderLevel );
	value = max( value, vec3( 0.0 ) );
	vec3 low = 1.0 - smoothstep( 0.0, linearStart, value );
	vec3 high = step( shoulderStart, value );
	vec3 curved = linearStart * pow( value / linearStart, vec3( ${number(filmLook.toe)} ) );
	vec3 straight = linearStart + contrast * ( value - linearStart );
	vec3 rolled = 1.0 - ( 1.0 - shoulderLevel ) * exp( - fall * ( value - shoulderStart ) );
	return curved * low + straight * ( 1.0 - low - high ) + rolled * high;

}

vec3 filmDevelop( vec3 color ) {

	const vec3 weights = vec3( 0.2126, 0.7152, 0.0722 );
	color *= ${number(filmLook.exposure)};
	color = mix( vec3( dot( color, weights ) ), color, ${number(filmLook.inset)} );
	vec3 mapped = filmCurve( color );
	float tone = dot( mapped, weights );
	float keep = mix( ${number(filmLook.shadowSaturation)}, 1.0, smoothstep( 0.0, ${number(filmLook.shadowReach)}, tone ) );
	return clamp( mix( vec3( tone ), mapped, keep ), 0.0, 1.0 );

}
`

const stock = 'vec3 CustomToneMapping( vec3 color ) { return color; }'

export function filmToneMapping(chunk: string) {
  if (!chunk.includes(stock)) return chunk
  return chunk.replace(
    stock,
    `${filmChunk}\nvec3 CustomToneMapping( vec3 color ) { return filmDevelop( color * toneMappingExposure ); }`,
  )
}

export function developOnFilm() {
  ShaderChunk.tonemapping_pars_fragment = filmToneMapping(ShaderChunk.tonemapping_pars_fragment)
}
