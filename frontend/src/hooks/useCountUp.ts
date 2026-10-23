import { useState, useEffect } from 'react'

export function useCountUp(target: number, durationMs: number = 1200, start: boolean = true): number {
  const [count, setCount] = useState<number>(0)

  useEffect(() => {
    if (!start) return

    // If reduced motion is active, jump straight to target
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setCount(target)
      return
    }

    if (target === 0) {
      setCount(0)
      return
    }

    let startTimestamp: number | null = null
    let frameId: number

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / durationMs, 1)
      // Ease-out cubic formula
      const easeOut = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(easeOut * target))

      if (progress < 1) {
        frameId = requestAnimationFrame(step)
      } else {
        setCount(target)
      }
    }

    frameId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [target, durationMs, start])

  return count
}
