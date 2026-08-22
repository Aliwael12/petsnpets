import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { Layout } from './components/Layout';
import { RoleGuard } from './components/RoleGuard';
import { SignIn } from './pages/SignIn';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { POS } from './pages/POS';
import { Transactions } from './pages/Transactions';
import { PetLogs } from './pages/PetLogs';
import { Employees } from './pages/Employees';
import { Analytics } from './pages/Analytics';
import { MoneyInOut } from './pages/MoneyInOut';

function App() {
  const currentUser = useStore((s) => s.currentUser());

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { fontSize: '14px' } }} />
      <Routes>
        {!currentUser ? (
          <Route path="*" element={<SignIn />} />
        ) : (
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route
              path="/pet-logs"
              element={
                <RoleGuard path="/pet-logs">
                  <PetLogs />
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
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        )}
      </Routes>
    </>
  );
}

export default App;
