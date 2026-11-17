import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import PinGate from "./components/PinGate";
import { ToastProvider } from "./components/Toast";
import { Loading } from "./components/ui";
import { AppDataProvider } from "./context/AppData";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Ringkasan from "./pages/Ringkasan";

// Halaman pertama (Ringkasan) ikut di bundle utama; sisanya diunduh saat pertama dibuka.
const Stok = lazy(() => import("./pages/Stok"));
const Produksi = lazy(() => import("./pages/Produksi"));
const Penjualan = lazy(() => import("./pages/Penjualan"));
const Keuangan = lazy(() => import("./pages/Keuangan"));
const Laporan = lazy(() => import("./pages/Laporan"));
const Master = lazy(() => import("./pages/Master"));
const Akun = lazy(() => import("./pages/Akun"));

const page = (el: JSX.Element) => <Suspense fallback={<Loading />}>{el}</Suspense>;

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
          <Route path="stok" element={page(<Stok />)} />
          <Route path="produksi" element={page(<Produksi />)} />
          <Route path="penjualan" element={page(<Penjualan />)} />
          <Route path="keuangan" element={page(<Keuangan />)} />
          <Route path="laporan" element={page(<Laporan />)} />
          <Route path="master" element={page(<Master />)} />
          <Route path="akun" element={page(<Akun />)} />
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
