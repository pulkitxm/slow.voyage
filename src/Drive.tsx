import { useEffect, useRef } from 'react'
import { RoadEngine } from './game/engine'

export function Drive() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current) return
    const engine = new RoadEngine(canvas.current)
    return () => engine.dispose()
  }, [])
  return <main className="drive"><canvas ref={canvas} aria-label="An endless road through rolling hills" /><header className="brand">slow roads<span>TAKE THE LONG WAY HOME</span></header><div className="intro"><span>NO DESTINATION. NO HURRY.</span><h1>A little further.<br/><i>A little slower.</i></h1><p>Just you, the road, and whatever comes next.</p></div><footer>W / ↑ accelerate &nbsp;&nbsp; S / ↓ brake &nbsp;&nbsp; A D / ← → steer</footer></main>
}
