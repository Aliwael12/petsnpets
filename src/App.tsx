import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/useAuthStore';
import { Layout } from './components/Layout';
import { RoleGuard } from './components/RoleGuard';
import { SignIn } from './pages/SignIn';
import { Home } from './site/Home';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { POS } from './pages/POS';
import { Transactions } from './pages/Transactions';
import { Clients } from './pages/Clients';
import { PetLogs } from './pages/PetLogs';
import { Calendar } from './pages/Calendar';
import { PriceChecker } from './pages/PriceChecker';
import { Employees } from './pages/Employees';
import { Analytics } from './pages/Analytics';
import { MoneyInOut } from './pages/MoneyInOut';
import { Expenses } from './pages/Expenses';
import { Settings } from './pages/Settings';

function App() {
  const employee = useAuthStore((s) => s.employee);
  const isExpired = useAuthStore((s) => s.isExpired());
  const clearSession = useAuthStore((s) => s.clearSession);

  // A session persisted before `enabledFeatures` existed rehydrates without it — sign that
  // stale shape out cleanly rather than leaving someone stuck on a nav-less Dashboard.
  const isStaleSession = !!employee && !Array.isArray(employee.enabledFeatures);
  useEffect(() => {
    if (isStaleSession) clearSession();
  }, [isStaleSession, clearSession]);

  const signedIn = employee && !isExpired && !isStaleSession;

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { fontSize: '14px' } }} />
      <Routes>
        {/* The public website is always reachable, signed in or not — a staff member
            with an open session should still be able to look at the live site. */}
        <Route path="/" element={<Home />} />
        <Route path="/staff" element={signedIn ? <Navigate to="/dashboard" replace /> : <SignIn />} />

        {!signedIn ? (
          <Route path="*" element={<Navigate to="/staff" replace />} />
        ) : (
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/products"
              element={
                <RoleGuard path="/products">
                  <Products />
                </RoleGuard>
              }
            />
            <Route
              path="/pos"
              element={
                <RoleGuard path="/pos">
                  <POS />
                </RoleGuard>
              }
            />
            <Route
              path="/transactions"
              element={
                <RoleGuard path="/transactions">
                  <Transactions />
                </RoleGuard>
              }
            />
            <Route
              path="/clients"
              element={
                <RoleGuard path="/clients">
                  <Clients />
                </RoleGuard>
              }
            />
            <Route
              path="/pet-logs"
              element={
                <RoleGuard path="/pet-logs">
                  <PetLogs />
                </RoleGuard>
              }
            />
            <Route
              path="/calendar"
              element={
                <RoleGuard path="/calendar">
                  <Calendar />
                </RoleGuard>
              }
            />
            <Route
              path="/price-checker"
              element={
                <RoleGuard path="/price-checker">
                  <PriceChecker />
                </RoleGuard>
              }
            />
            <Route
              path="/employees"
              element={
                <RoleGuard path="/employees">
                  <Employees />
                </RoleGuard>
              }
            />
            <Route
              path="/analytics"
              element={
                <RoleGuard path="/analytics">
                  <Analytics />
                </RoleGuard>
              }
            />
            <Route
              path="/money"
              element={
                <RoleGuard path="/money">
                  <MoneyInOut />
                </RoleGuard>
              }
            />
            <Route
              path="/expenses"
              element={
                <RoleGuard path="/expenses">
                  <Expenses />
                </RoleGuard>
              }
            />
            <Route
              path="/settings"
              element={
                <RoleGuard path="/settings">
                  <Settings />
                </RoleGuard>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        )}
      </Routes>
    </>
  );
}

export default App;
