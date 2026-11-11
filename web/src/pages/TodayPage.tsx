import TodaySales from '../components/TodaySales.tsx'
import VoidRequests from '../components/VoidRequests.tsx'

export default function TodayPage() {
  return (
    <div className="space-y-5">
      <VoidRequests />
      <TodaySales />
    </div>
  )
}
