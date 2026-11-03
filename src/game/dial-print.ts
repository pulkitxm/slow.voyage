import * as THREE from 'three'

export class DialPrint {
  canvas = document.createElement('canvas')
  context: CanvasRenderingContext2D

  constructor(public radius: number) {
    this.canvas.width = this.canvas.height = 512
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Instrument drawing canvas is unavailable')
    this.context = context
    context.translate(256, 256)
    context.scale(256 / radius, 256 / radius)
    context.fillStyle = '#ffffff'
  }

  tick(angle: number, major: boolean) {
    const context = this.context
    const width = this.radius * (major ? 0.03 : 0.016)
    const length = this.radius * (major ? 0.14 : 0.07)
    context.save()
    context.translate(Math.sin(angle) * this.radius * 0.85, -Math.cos(angle) * this.radius * 0.85)
    context.rotate(angle)
    context.fillRect(-width / 2, -length / 2, width, length)
    context.restore()
  }

  label(shapes: THREE.Shape[], center: THREE.Vector3, x: number, z: number) {
    const context = this.context
    context.save()
    context.translate(x, z)
    context.scale(1, -1)
    context.translate(-center.x, -center.y)
    context.beginPath()
    const trace = (path: THREE.Path) => {
      const points = path.getPoints(12)
      const first = points[0]
      if (!first) return
      context.moveTo(first.x, first.y)
      for (const point of points.slice(1)) context.lineTo(point.x, point.y)
      context.closePath()
    }
    for (const shape of shapes) {
      trace(shape)
      for (const hole of shape.holes) trace(hole)
    }
    context.fill('evenodd')
    context.restore()
  }

  texture() {
    const pixels = this.context.getImageData(0, 0, 512, 512)
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = 255
      pixels.data[index + 1] = 255
      pixels.data[index + 2] = 255
    }
    const texture = new THREE.DataTexture(pixels.data, 512, 512)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = true
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
  }
}
