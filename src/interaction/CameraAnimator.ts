import type { ViewportState } from '@/types/board'
import type { ViewportManager } from '@/core/boardview/ViewportManager'

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export class CameraAnimator {
  private rafId = 0
  private running = false

  cancel() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.running = false
  }

  animateTo(
    vpManager: ViewportManager,
    target: ViewportState,
    duration = 420,
    onDone?: () => void
  ) {
    this.cancel()
    const start = vpManager.getState()
    const t0 = performance.now()
    this.running = true

    const tick = (now: number) => {
      const raw = Math.min(1, (now - t0) / duration)
      const t = easeOutCubic(raw)
      vpManager.setViewport({
        zoom: start.zoom + (target.zoom - start.zoom) * t,
        panX: start.panX + (target.panX - start.panX) * t,
        panY: start.panY + (target.panY - start.panY) * t,
      })
      if (raw < 1) {
        this.rafId = requestAnimationFrame(tick)
      } else {
        this.running = false
        onDone?.()
      }
    }
    this.rafId = requestAnimationFrame(tick)
  }

  flyToComponent(
    vpManager: ViewportManager,
    coordEngine: import('@/core/boardview/CoordinateEngine').CoordinateEngine,
    componentId: string,
    viewportW: number,
    viewportH: number,
    targetZoom = 1.35,
    onDone?: () => void
  ) {
    const pan = coordEngine.centerOnComponent(
      componentId,
      viewportW,
      viewportH,
      targetZoom
    )
    if (!pan) return
    this.animateTo(vpManager, { zoom: targetZoom, ...pan }, 480, onDone)
  }

  isAnimating() {
    return this.running
  }
}
