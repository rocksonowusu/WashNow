import type { CSSProperties } from 'react'

type Corner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

const placement: Record<Corner, { position: string; at: string }> = {
  'top-right': { position: 'top-0 right-0', at: '100% 0%' },
  'top-left': { position: 'top-0 left-0', at: '0% 0%' },
  'bottom-right': { position: 'right-0 bottom-0', at: '100% 100%' },
  'bottom-left': { position: 'bottom-0 left-0', at: '0% 100%' },
}

type Props = {
  /** Rings spread from the corner like ripples; lines run diagonally. */
  kind: 'rings' | 'lines'
  corner: Corner
  /** Width and height in pixels. The art fades out before it reaches the far edge. */
  size: number
  /** Sets how faint it is, e.g. "text-accent/5" on the page or "text-surface/10" on blue. */
  tone: string
}

/**
 * Decoration only: a faint patch of rings or lines tucked into one corner of
 * its parent. The parent needs `relative` and `overflow-hidden` (or `isolate`),
 * and its real content should sit above with `relative`.
 */
export default function CornerArt({ kind, corner, size, tone }: Props) {
  const { position, at } = placement[corner]

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute ${position} ${kind === 'rings' ? 'art-rings' : 'art-lines'} ${tone}`}
      style={{ width: size, height: size, '--art-at': at } as CSSProperties}
    />
  )
}
