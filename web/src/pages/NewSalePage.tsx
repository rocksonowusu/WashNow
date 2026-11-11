import SaleForm from '../components/SaleForm.tsx'
import TodaySales from '../components/TodaySales.tsx'

/**
 * Phone: just the form, so nothing gets between the cashier and Save.
 * Wide screens: the form with today's running list beside it, so a saved
 * sale appears straight away.
 */
export default function NewSalePage() {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <SaleForm />
      <div className="hidden xl:block">
        <TodaySales />
      </div>
    </div>
  )
}
