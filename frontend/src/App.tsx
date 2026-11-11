import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import PinGate from "./components/PinGate";
import { ToastProvider } from "./components/Toast";
import { AppDataProvider } from "./context/AppData";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Keuangan from "./pages/Keuangan";
import Laporan from "./pages/Laporan";
import Master from "./pages/Master";
import Penjualan from "./pages/Penjualan";
import Produksi from "./pages/Produksi";
import Ringkasan from "./pages/Ringkasan";
import Stok from "./pages/Stok";

function AppContent() {
  const { user, unlock } = useAuth();

  // Belum terbuka: hanya PinGate yang dirender. Data (AppDataProvider) baru dimuat setelah
  // ada token, dan ikut dibuang saat terkunci supaya akun berikutnya mulai dari keadaan bersih.
  if (!user) return <PinGate onUnlock={unlock} />;

  return (
    <AppDataProvider key={user.id}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Ringkasan />} />
          <Route path="stok" element={<Stok />} />
          <Route path="produksi" element={<Produksi />} />
          <Route path="penjualan" element={<Penjualan />} />
          <Route path="keuangan" element={<Keuangan />} />
          <Route path="laporan" element={<Laporan />} />
          <Route path="master" element={<Master />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppDataProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
