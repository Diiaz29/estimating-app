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
        <Route path="/contractors" element={<Customers />} />
        <Route path="/contractors/:id" element={<CustomerDetail />} />
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
