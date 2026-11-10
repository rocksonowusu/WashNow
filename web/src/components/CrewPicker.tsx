import { useLiveQuery } from 'dexie-react-hooks'
import { Check, UserRoundPlus } from 'lucide-react'
import { useState } from 'react'
import { db } from '../db/db.ts'
import { createCrewMember, LocalValidationError } from '../db/repositories.ts'
import type { Account } from '../db/types.ts'
import { ICON } from './icon.ts'
import { inputClass } from './styles.ts'
import { Button, Choice } from './ui.tsx'

type Props = {
  account: Account
  selectedIds: string[]
  onChange: (ids: string[]) => void
  error?: string
}

/**
 * Choose who washed the vehicle. Tap names from the crew list, or type a
 * name: typing narrows the list, and a name that is not on it yet can be
 * added to the crew there and then.
 */
export default function CrewPicker({ account, selectedIds, onChange, error }: Props) {
  const crew = useLiveQuery(async () => (await db.washers.orderBy('name').toArray()).filter((member) => member.active), [])

  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  if (!crew) return null

  const typed = query.trim().replace(/\s+/g, ' ')
  const exact = crew.find((member) => member.name.toLowerCase() === typed.toLowerCase())
  // People already picked stay visible while the list is narrowed.
  const shown = crew.filter(
    (member) => selectedIds.includes(member.id) || member.name.toLowerCase().includes(typed.toLowerCase()),
  )

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((other) => other !== id) : [...selectedIds, id])
  }

  async function addTyped() {
    if (typed === '') return

    // Typing the full name of someone on the list just picks them.
    if (exact) {
      if (!selectedIds.includes(exact.id)) onChange([...selectedIds, exact.id])
      setQuery('')
      return
    }

    setAdding(true)
    setAddError(null)
    try {
      const member = await createCrewMember(account, { name: typed })
      onChange([...selectedIds, member.id])
      setQuery('')
    } catch (caught) {
      setAddError(caught instanceof LocalValidationError ? caught.message : 'Could not add this person. Try again.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-text">Washed by</legend>

      <label htmlFor="crew-search" className="sr-only">
        Find a crew member or type a new name
      </label>
      <input
        id="crew-search"
        type="text"
        autoComplete="off"
        autoCapitalize="words"
        placeholder="Find, or type a new name"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setAddError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault() // do not submit the sale
            void addTyped()
          }
        }}
        className={`${inputClass} border-border`}
      />

      {shown.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
          {shown.map((member) => {
            const picked = selectedIds.includes(member.id)
            return (
              <Choice key={member.id} chosen={picked} onClick={() => toggle(member.id)} className="flex items-center justify-between gap-2">
                <span className="truncate">{member.name}</span>
                {picked && <Check {...ICON} className="shrink-0" />}
              </Choice>
            )
          })}
        </div>
      )}

      {typed !== '' && !exact && (
        <Button variant="secondary" className="mt-2 w-full" busy={adding} icon={<UserRoundPlus {...ICON} />} onClick={() => void addTyped()}>
          Add “{typed}” to the crew
        </Button>
      )}

      {crew.length === 0 && typed === '' && (
        <p className="mt-2 text-sm text-text-muted">No crew yet. Type a name above to add the first person.</p>
      )}

      {(addError ?? error) && <p className="mt-1 text-sm text-danger">{addError ?? error}</p>}
    </fieldset>
  )
}
