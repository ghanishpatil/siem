import { useEffect, useRef } from 'react'

interface Point {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  baseAlpha: number
}

export function CyberBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let animationFrameId: number
    let width = 0
    let height = 0
    let points: Point[] = []
    let mouseX = -9999
    let mouseY = -9999

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function initPoints() {
      points = []
      // Density based on screen area: ~35 on mobile, ~65 on desktop
      const count = Math.min(Math.floor((width * height) / 28000), 70)
      for (let i = 0; i < count; i++) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          radius: Math.random() * 1.5 + 1,
          baseAlpha: Math.random() * 0.35 + 0.15,
        })
      }
    }

    function resize() {
      if (!canvas) return
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
      initPoints()
    }

    resize()
    window.addEventListener('resize', resize)

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
    }

    const handleMouseLeave = () => {
      mouseX = -9999
      mouseY = -9999
    }

    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)

    // Render loop
    let lastTime = 0
    function draw(time: number) {
      if (!ctx) return
      const deltaTime = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time

      ctx.clearRect(0, 0, width, height)

      // Connect points with faint tactical grid lines
      const maxDist = 130
      const count = points.length

      for (let i = 0; i < count; i++) {
        const p1 = points[i]

        if (!prefersReducedMotion) {
          p1.x += p1.vx * (deltaTime * 60)
          p1.y += p1.vy * (deltaTime * 60)

          // Bounce off viewport boundaries
          if (p1.x < 0) {
            p1.x = 0
            p1.vx *= -1
          } else if (p1.x > width) {
            p1.x = width
            p1.vx *= -1
          }

          if (p1.y < 0) {
            p1.y = 0
            p1.vy *= -1
          } else if (p1.y > height) {
            p1.y = height
            p1.vy *= -1
          }

          // Gentle mouse repel effect
          const dxMouse = p1.x - mouseX
          const dyMouse = p1.y - mouseY
          const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse)
          if (distMouse < 140 && distMouse > 0) {
            const force = (140 - distMouse) / 140
            p1.x += (dxMouse / distMouse) * force * 1.5
            p1.y += (dyMouse / distMouse) * force * 1.5
          }
        }

        // Draw connections
        for (let j = i + 1; j < count; j++) {
          const p2 = points[j]
          const dx = p1.x - p2.x
          const dy = p1.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.14
            ctx.beginPath()
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`
            ctx.lineWidth = 0.75
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
        }

        // Draw node
        ctx.beginPath()
        ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 229, 255, ${p1.baseAlpha})`
        ctx.fill()
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(draw)
      }
    }

    if (prefersReducedMotion) {
      draw(0)
    } else {
      animationFrameId = requestAnimationFrame(draw)
    }

    // Visibility management to conserve CPU
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrameId)
      } else if (!prefersReducedMotion) {
        lastTime = performance.now()
        animationFrameId = requestAnimationFrame(draw)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Background canvas for cyber constellation */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" />

      {/* Radial vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#080B10_80%)] opacity-80" />

      {/* Cyber scanline sweep */}
      <div className="absolute inset-x-0 h-40 bg-linear-to-b from-transparent via-cyan-500/3 to-transparent animate-scanline pointer-events-none" />

      {/* Subtle top & bottom glow accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-225 h-87.5 bg-cyan-500/4 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-150 h-75 bg-orange-500/2.5 blur-[100px] rounded-full pointer-events-none" />
    </div>
  )
}
