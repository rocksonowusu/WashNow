import QuickSaleForm from '../components/QuickSaleForm.tsx'
import TodaySales from '../components/TodaySales.tsx'

/**
 * Phone: the form, with today's sales underneath. Wide screens: the form and
 * today's running list side by side, so a saved sale appears beside it.
 */
export default function NewSalePage() {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <QuickSaleForm />
      <TodaySales />
    </div>
  )
}
