import { useEffect, useRef, useState } from 'react'

/** Draw-your-signature box (mouse, finger, or pen). Calls onChange with a PNG
 *  data URL after every stroke, or null when cleared. */
export default function SignaturePad({ onChange, height = 180 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)

  // crisp lines on retina screens: draw at device pixels, show at CSS pixels
  useEffect(() => {
    const c = canvasRef.current!
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    c.width = Math.round(w * dpr)
    c.height = Math.round(height * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.lineWidth = 2.5
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = '#111'
  }, [height])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const g = e.currentTarget.getContext('2d')!
    const { x, y } = pos(e)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 0.1, y + 0.1) // a tap leaves a dot
    g.stroke()
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const g = e.currentTarget.getContext('2d')!
    const { x, y } = pos(e)
    g.lineTo(x, y)
    g.stroke()
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    drawing.current = false
    setDirty(true)
    onChange(e.currentTarget.toDataURL('image/png'))
  }
  function clear() {
    const c = canvasRef.current!
    const g = c.getContext('2d')!
    g.save()
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    g.restore()
    setDirty(false)
    onChange(null)
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-md border-2 border-dashed border-slate-400 bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: 'none' }}
          className="block w-full cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={(e) => drawing.current && up(e)}
        />
        {/* the line you sign on */}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-t border-slate-300" />
        {!dirty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
            sign here
          </div>
        )}
      </div>
      <button type="button" onClick={clear} className="mt-1.5 text-xs text-slate-500 underline decoration-dotted hover:text-slate-900">
        clear
      </button>
    </div>
  )
}
