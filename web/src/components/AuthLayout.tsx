import type { ReactNode } from 'react'

/**
 * Frame for the sign-in and PIN screens: a solid blue panel with the logo
 * large in the middle (beside the form on wide screens, above it on phones).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <div className="stripes-on-blue flex flex-col items-center justify-center bg-accent px-6 py-10 text-center text-surface lg:min-h-screen lg:px-12">
        <img src="/brand/washnow-logo-white.svg" alt="WashNow" className="h-20 w-auto sm:h-24 lg:h-36" />
        <span aria-hidden="true" className="mt-5 block h-1.5 w-20 rounded-control bg-sun lg:mt-7 lg:w-28" />
        <p className="mt-5 max-w-sm text-lg text-surface/85 lg:mt-7 lg:text-xl">
          The washing bay’s sales book. Keeps working when the internet does not.
        </p>
      </div>

      <main className="px-4 py-8 lg:flex lg:items-center lg:px-12">
        <div className="mx-auto w-full max-w-sm rounded-card border border-border bg-surface px-5 py-6">{children}</div>
      </main>
    </div>
  )
}
