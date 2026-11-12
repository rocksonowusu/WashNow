import {
  CalendarCheck,
  ChartColumn,
  CirclePlus,
  ClipboardList,
  ContactRound,
  Ellipsis,
  LayoutDashboard,
  ReceiptText,
  RefreshCw,
  Settings,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../db/types.ts'

export type Destination = {
  to: string
  label: string
  icon: LucideIcon
  /** Shorter name for the phone tab bar, where space is tight. */
  tabLabel?: string
  /** Has its own tab on phones. The rest are reached through "More". */
  phoneTab?: boolean
  /** Hidden from cashiers, and the route refuses them. */
  ownerOnly?: boolean
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
  { to: '/reports', label: 'Reports', icon: ChartColumn, ownerOnly: true, about: 'Sales, crew pay and expenses for any dates. Excel and PDF.' },
  { to: '/day-close', label: 'Day close', icon: CalendarCheck, ownerOnly: true, about: 'Check a day’s totals and lock it.' },
  { to: '/settings', label: 'Settings', icon: Settings, ownerOnly: true, about: 'Prices, who can sign in, and the loyalty rule.' },
  { to: '/sync', label: 'Sync', icon: RefreshCw, about: 'What is waiting to reach the server, and signing out.' },
]

/** The screens this person may open. */
export function destinationsFor(role: Role | undefined): Destination[] {
  return DESTINATIONS.filter((destination) => !destination.ownerOnly || role === 'owner')
}

export const PHONE_TABS = DESTINATIONS.filter((destination) => destination.phoneTab)

/** Phones only: the screen listing everything that has no tab of its own. */
export const MORE: Destination = { to: '/more', label: 'More', icon: Ellipsis }
