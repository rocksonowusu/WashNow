// Class strings shared by more than one component.

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * Buttons look 40 px tall but answer taps over 48 px: an invisible layer
 * reaches 4 px past each edge, so DESIGN.md's 48 px touch target still holds.
 */
export const hitArea = "relative before:absolute before:-inset-1 before:content-['']"

export const inputClass = `min-h-12 w-full rounded-control border bg-surface px-3 text-text placeholder:text-text-muted ${focusRing}`

/** Column headings for the plain data tables. */
export const tableHead = 'bg-surface-alt text-left text-sm text-text-muted'
