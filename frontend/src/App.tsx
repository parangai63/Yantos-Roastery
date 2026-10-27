import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { AppDataProvider } from "./context/AppData";
import Keuangan from "./pages/Keuangan";
import Laporan from "./pages/Laporan";
import Master from "./pages/Master";
import Penjualan from "./pages/Penjualan";
import Produksi from "./pages/Produksi";
import Ringkasan from "./pages/Ringkasan";
import Stok from "./pages/Stok";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppDataProvider>
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
      </ToastProvider>
    </BrowserRouter>
  );
}
