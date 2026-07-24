import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Bids from './pages/Bids'
import BidDetail from './pages/BidDetail'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Team from './pages/Team'
import Settings from './pages/Settings'
import Overhead from './pages/Overhead'
import Estimate from './pages/Estimate'
import RevisionView from './pages/RevisionView'
import OrderSheet from './pages/OrderSheet'
import MathView from './pages/MathView'
import Proposal from './pages/Proposal'
import Actuals from './pages/Actuals'
import Jobs from './pages/Jobs'
import PlanRoom from './pages/PlanRoom'
import Schedule from './pages/Schedule'
import JobSchedule from './pages/JobSchedule'
import Reports from './pages/Reports'
import LibrariesLayout from './components/LibrariesLayout'
import BidLayout from './components/BidLayout'
import Materials from './pages/libraries/Materials'
import Finishes from './pages/libraries/Finishes'
import Assemblies from './pages/libraries/Assemblies'
import AssemblyDetail from './pages/libraries/AssemblyDetail'

function Gate() {
  const { session, loading } = useAuth()

  if (!supabaseConfigured) {
    return (
      <Center>
        <p className="text-sm text-slate-600">
          Supabase isn't configured — the app needs its URL and key to run.
        </p>
      </Center>
    )
  }
  if (loading) {
    return (
      <Center>
        <p className="text-sm text-slate-400">Loading…</p>
      </Center>
    )
  }
  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bids" element={<Bids />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/bids/:id" element={<BidLayout />}>
          <Route index element={<BidDetail />} />
          <Route path="estimate" element={<Estimate />} />
          <Route path="revisions/:revId" element={<RevisionView />} />
          <Route path="order" element={<OrderSheet />} />
          <Route path="math" element={<MathView />} />
          <Route path="proposal" element={<Proposal />} />
          <Route path="actuals" element={<Actuals />} />
          <Route path="schedule" element={<JobSchedule />} />
          <Route path="plans" element={<PlanRoom />} />
        </Route>
        <Route path="/reports" element={<Reports />} />
        <Route path="/contractors" element={<Customers />} />
        <Route path="/contractors/:id" element={<CustomerDetail />} />
        <Route path="/libraries" element={<LibrariesLayout />}>
          <Route index element={<Materials />} />
          <Route path="hardware" element={<Materials mode="hardware" />} />
          <Route path="finishes" element={<Finishes />} />
          <Route path="assemblies" element={<Assemblies />} />
        </Route>
        <Route path="/libraries/assemblies/:id" element={<AssemblyDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/overhead" element={<Overhead />} />
        <Route path="/team" element={<Team />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">{children}</div>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}
