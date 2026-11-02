import * as THREE from 'three'

export class RoadEngine {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000)
  frame = 0
  resize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.scene.background = new THREE.Color('#b5c6bb')
    this.scene.fog = new THREE.Fog('#b5c6bb', 150, 1800)
    this.scene.add(new THREE.HemisphereLight('#fff7df', '#64744d', 2.5))
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 90, 90), new THREE.MeshStandardMaterial({ color: '#87916a', flatShading: true }))
    ground.rotation.x = -Math.PI / 2
    const p = ground.geometry.attributes.position
    for (let i = 0; i < p.count; i++) { const x=p.getX(i), y=p.getY(i); p.setZ(i, (Math.sin(x/220)+Math.cos(y/300))*40*Math.min(1,Math.abs(x)/100)) }
    ground.geometry.computeVertexNormals()
    this.scene.add(ground)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 3000), new THREE.MeshStandardMaterial({ color: '#777a75' }))
    road.rotation.x = -Math.PI/2
    road.position.y = 0.2
    this.scene.add(road)
    this.camera.position.set(12, 7, 23)
    this.camera.lookAt(0, 0, -150)
    this.resize()
    window.addEventListener('resize', this.resize)
    const render=()=>{ this.frame=requestAnimationFrame(render); this.renderer.render(this.scene,this.camera) }
    render()
  }
  dispose() { cancelAnimationFrame(this.frame); window.removeEventListener('resize',this.resize); this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}}); this.renderer.dispose() }
}
