import {
  CirclePlus,
  ClipboardList,
  ContactRound,
  Ellipsis,
  LayoutDashboard,
  ReceiptText,
  RefreshCw,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export type Destination = {
  to: string
  label: string
  icon: LucideIcon
  /** Shorter name for the phone tab bar, where space is tight. */
  tabLabel?: string
  /** Has its own tab on phones. The rest are reached through "More". */
  phoneTab?: boolean
  /** One line for the More screen. */
  about?: string
}

/** Every screen, in the order the side navigation lists them. */
export const DESTINATIONS: Destination[] = [
  { to: '/', label: 'Dashboard', tabLabel: 'Home', icon: LayoutDashboard, phoneTab: true },
  { to: '/new-sale', label: 'New sale', icon: CirclePlus, phoneTab: true },
  { to: '/today', label: 'Today', icon: ClipboardList, phoneTab: true },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText, phoneTab: true },
  { to: '/customers', label: 'Customers', icon: ContactRound, about: 'Find a regular by plate, name or phone, or add one.' },
  { to: '/crew', label: 'Crew', icon: UsersRound, about: 'The people who wash the vehicles.' },
  { to: '/sync', label: 'Sync', icon: RefreshCw, about: 'What is waiting to reach the server, and signing out.' },
]

export const PHONE_TABS = DESTINATIONS.filter((destination) => destination.phoneTab)

/** Phones only: the screen listing everything that has no tab of its own. */
export const MORE: Destination = { to: '/more', label: 'More', icon: Ellipsis }

export const UNDER_MORE = DESTINATIONS.filter((destination) => !destination.phoneTab)
