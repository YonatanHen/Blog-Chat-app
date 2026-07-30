import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn.js'

/**
 * Generated cover art for a post, drawn from a hash of its slug — same slug,
 * same drawing, forever. Stands in the exact slot a real cover image will
 * occupy once uploads land (P5), so the layout does not move when it does.
 */

const PENS = ['--pen-0', '--pen-1', '--pen-2', '--pen-3', '--pen-4'] as const

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// #RRGGBB -> rgba(), so one pen token can serve both the wash and the linework.
function rgba(hex: string, alpha: number): string {
  let v = hex.trim().replace('#', '')
  // Doubling each char rather than indexing: under noUncheckedIndexedAccess
  // every v[n] is string | undefined, which this expression cannot use.
  if (v.length === 3) v = v.replace(/./g, (c) => c + c)
  const n = Number.parseInt(v, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

type Motif = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void

// Line counts are tuned for a wide featured tile; at grid width the same count
// collapses into moiré, so every motif scales its density by this.
function density(w: number): number {
  return Math.min(1, Math.max(0.55, w / 620))
}

const arcs: Motif = (ctx, w, h, rnd) => {
  const ox = rnd() < 0.5 ? w * 0.08 : w * 0.92
  const oy = h * (0.15 + rnd() * 0.7)
  const count = Math.round((26 + rnd() * 14) * density(w))
  const step = (Math.max(w, h) * 1.25) / count
  for (let i = 1; i <= count; i++) {
    ctx.beginPath()
    ctx.lineWidth = i % 5 === 0 ? 2 : 0.9
    ctx.arc(ox, oy, step * i * (0.85 + rnd() * 0.3), 0, Math.PI * 2)
    ctx.stroke()
  }
}

const isogrid: Motif = (ctx, w, h, rnd) => {
  const cell = w / Math.round((10 + rnd() * 5) * density(w))
  const skew = 0.45 + rnd() * 0.25
  for (let x = -h; x < w + h; x += cell) {
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + h * skew, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x - h * skew, h)
    ctx.stroke()
  }
  for (let k = 0; k < 3; k++) {
    const cx = w * (0.2 + rnd() * 0.6)
    const cy = h * (0.2 + rnd() * 0.6)
    const r = cell * (0.8 + rnd())
    ctx.beginPath()
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r * skew * 2, cy)
    ctx.lineTo(cx, cy + r)
    ctx.lineTo(cx - r * skew * 2, cy)
    ctx.closePath()
    ctx.fill()
  }
}

const strata: Motif = (ctx, w, h, rnd) => {
  const bands = Math.round((28 + rnd() * 14) * density(w))
  for (let i = 0; i < bands; i++) {
    const y = (h / bands) * i + h / bands / 2
    const amp = h * 0.03 * (0.3 + rnd() * 2.2)
    const freq = (1.2 + rnd() * 2.4) * Math.PI * 2
    const phase = rnd() * Math.PI * 2
    ctx.beginPath()
    ctx.lineWidth = i % 6 === 0 ? 2 : 0.9
    for (let x = 0; x <= w; x += 3) {
      const yy = y + Math.sin((x / w) * freq + phase) * amp
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }
}

const spokes: Motif = (ctx, w, h, rnd) => {
  const cx = w * (0.25 + rnd() * 0.5)
  const cy = h * (0.25 + rnd() * 0.5)
  const count = Math.round((56 + rnd() * 34) * density(w))
  const reach = Math.hypot(w, h)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    ctx.beginPath()
    ctx.lineWidth = i % 8 === 0 ? 1.8 : 0.8
    ctx.moveTo(cx + Math.cos(a) * reach * 0.06, cy + Math.sin(a) * reach * 0.06)
    ctx.lineTo(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach)
    ctx.stroke()
  }
  // Concentric rings across the spokes — a solid wedge here read as a pie
  // chart and swallowed the tile.
  for (let r = 1; r <= 5; r++) {
    ctx.beginPath()
    ctx.lineWidth = r === 3 ? 2 : 0.9
    ctx.arc(cx, cy, reach * 0.09 * r * (0.9 + rnd() * 0.35), 0, Math.PI * 2)
    ctx.stroke()
  }
}

const nest: Motif = (ctx, w, h, rnd) => {
  const count = Math.round((30 + rnd() * 16) * density(w))
  const turn = (rnd() - 0.5) * 0.06
  ctx.save()
  ctx.translate(w / 2, h / 2)
  for (let i = count; i > 0; i--) {
    const sw = (w * 1.15 * i) / count
    const sh = (h * 1.15 * i) / count
    ctx.rotate(turn)
    ctx.beginPath()
    ctx.lineWidth = i % 5 === 0 ? 2 : 0.9
    ctx.rect(-sw / 2, -sh / 2, sw, sh)
    ctx.stroke()
  }
  ctx.restore()
}

const MOTIFS: Motif[] = [arcs, isogrid, strata, spokes, nest]

export function PostTile({ slug, className }: { slug: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const draw = () => {
      // Nothing laid out yet (or jsdom, which reports 0×0) — no context needed.
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const css = getComputedStyle(document.documentElement)
      // Three independent hashes: sharing one made motif and pen move together,
      // so neighbouring posts kept drawing the same figure in the same colour.
      const seed = hash(slug)
      // The `??` fallbacks are unreachable — a positive modulo is always in
      // range — but noUncheckedIndexedAccess cannot know that, and asserting
      // non-null would hide a real out-of-range bug if these lists ever change.
      const motif = MOTIFS[hash(`${slug}#motif`) % MOTIFS.length] ?? arcs
      const penToken = PENS[hash(`${slug}#pen`) % PENS.length] ?? PENS[0]
      const pen = css.getPropertyValue(penToken) || '#0f5d57'
      const wash = Number.parseFloat(css.getPropertyValue('--tile-wash')) || 0.07
      const line = Number.parseFloat(css.getPropertyValue('--tile-line')) || 0.72

      ctx.fillStyle = css.getPropertyValue('--sheet') || '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = rgba(pen, wash)
      ctx.fillRect(0, 0, w, h)

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.clip()
      ctx.strokeStyle = rgba(pen, line)
      ctx.fillStyle = rgba(pen, line)
      ctx.lineJoin = 'round'
      motif(ctx, w, h, makeRng(seed))
      ctx.restore()
    }

    draw()

    if (typeof ResizeObserver === 'undefined') return
    let pending = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(draw)
    })
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(pending)
      observer.disconnect()
    }
  }, [slug])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn('block aspect-[16/10] w-full bg-[var(--muted)]', className)}
    />
  )
}
