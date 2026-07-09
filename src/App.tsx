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
import Estimate from './pages/Estimate'
import LibrariesLayout from './components/LibrariesLayout'
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
        <Route path="/bids/:id" element={<BidDetail />} />
        <Route path="/bids/:id/estimate" element={<Estimate />} />
        <Route path="/contractors" element={<Customers />} />
        <Route path="/contractors/:id" element={<CustomerDetail />} />
        <Route path="/libraries" element={<LibrariesLayout />}>
          <Route index element={<Materials />} />
          <Route path="finishes" element={<Finishes />} />
          <Route path="assemblies" element={<Assemblies />} />
        </Route>
        <Route path="/libraries/assemblies/:id" element={<AssemblyDetail />} />
        <Route path="/settings" element={<Settings />} />
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
