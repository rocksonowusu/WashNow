import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useNewSale } from '../components/NewSale.tsx'

/**
 * New sale is a modal now, opened from any screen. This address still works
 * (old bookmarks, the installed app's start link): it shows Today with the
 * modal open over it.
 */
export default function NewSalePage() {
  const openNewSale = useNewSale()

  useEffect(() => {
    openNewSale()
  }, [openNewSale])

  return <Navigate to="/today" replace />
}
