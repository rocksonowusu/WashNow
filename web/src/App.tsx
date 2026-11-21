import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/AuthContext.tsx'
import AdminShell from './components/AdminShell.tsx'
import AppShell from './components/AppShell.tsx'
import AdminBayPage from './pages/AdminBayPage.tsx'
import AdminPage from './pages/AdminPage.tsx'
import CrewPage from './pages/CrewPage.tsx'
import CustomersPage from './pages/CustomersPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import DayClosePage from './pages/DayClosePage.tsx'
import ExpensesPage from './pages/ExpensesPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import MorePage from './pages/MorePage.tsx'
import NewSalePage from './pages/NewSalePage.tsx'
import ReportsPage from './pages/ReportsPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import SyncPage from './pages/SyncPage.tsx'
import TodayPage from './pages/TodayPage.tsx'
import UnlockPage from './pages/UnlockPage.tsx'

/**
 * Screens behind this need someone unlocked. Nobody unlocked: go to the PIN
 * screen if people have used this device before, otherwise to sign-in.
 */
function RequireAccount({ children }: { children: ReactNode }) {
  const { ready, account, accounts } = useAuth()

  if (!ready) return null
  if (!account) return <Navigate to={accounts.length > 0 ? '/unlock' : '/login'} replace />

  // The server stopped accepting this person's token (PIN changed, or access
  // turned off). They must sign in online again.
  if (!account.token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ phone: account.phone, notice: 'Your sign-in on this device has ended. Sign in again to carry on.' }}
      />
    )
  }

  return children
}

/** Screens a cashier must never open, even by typing the address. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  return account?.role === 'owner' ? children : <Navigate to="/" replace />
}

/**
 * The bay's own screens. The WashNow admin belongs to no bay, so they are
 * sent to the admin area instead (the server refuses them here too).
 */
function BayOnly({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  return account?.role === 'admin' ? <Navigate to="/admin" replace /> : children
}

/** Only the person who runs WashNow itself. The server refuses everyone else too. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  return account?.role === 'admin' ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unlock" element={<UnlockPage />} />

      {/* A bay's screens share the bay's navigation frame. */}
      <Route
        element={
          <RequireAccount>
            <BayOnly>
              <AppShell />
            </BayOnly>
          </RequireAccount>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/new-sale" element={<NewSalePage />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/crew" element={<CrewPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/reports" element={<OwnerOnly><ReportsPage /></OwnerOnly>} />
        <Route path="/day-close" element={<OwnerOnly><DayClosePage /></OwnerOnly>} />
        <Route path="/settings" element={<OwnerOnly><SettingsPage /></OwnerOnly>} />
        <Route path="/sync" element={<SyncPage />} />
      </Route>

      {/* The WashNow admin's own frame: every washing bay. */}
      <Route
        element={
          <RequireAccount>
            <AdminOnly>
              <AdminShell />
            </AdminOnly>
          </RequireAccount>
        }
      >
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/bays/:id" element={<AdminBayPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
