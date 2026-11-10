import type { ReactNode } from 'react'
import CornerArt from './CornerArt.tsx'

/**
 * Frame for the sign-in and PIN screens: a solid blue panel with the logo
 * large in the middle (beside the form on wide screens, above it on phones).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-accent px-6 py-10 text-center text-surface lg:min-h-screen lg:px-12">
        <CornerArt kind="rings" corner="bottom-left" size={520} tone="text-surface/10" />
        <CornerArt kind="lines" corner="top-right" size={380} tone="text-surface/10" />

        <img src="/brand/washnow-logo-white.svg" alt="WashNow" className="relative h-20 w-auto sm:h-24 lg:h-36" />
        <span aria-hidden="true" className="relative mt-5 block h-1.5 w-20 rounded-control bg-sun lg:mt-7 lg:w-28" />
        <p className="relative mt-5 max-w-sm text-lg text-surface/85 lg:mt-7 lg:text-xl">
          The washing bay’s sales book. Keeps working when the internet does not.
        </p>
      </div>

      <main className="relative overflow-hidden px-4 py-8 lg:flex lg:items-center lg:px-12">
        <CornerArt kind="rings" corner="top-right" size={420} tone="text-accent/5" />
        <CornerArt kind="lines" corner="bottom-left" size={320} tone="text-accent/5" />

        <div className="relative mx-auto w-full max-w-sm rounded-card border border-border bg-surface px-5 py-6">{children}</div>
      </main>
    </div>
  )
}
