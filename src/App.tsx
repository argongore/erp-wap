import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/layout/Header.tsx';
import { Sidebar, ActiveTab } from './components/layout/Sidebar.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { PenjualanView } from './components/kasir/PenjualanView.tsx';
import { PembelianHasilBumiView } from './components/kasir/PembelianHasilBumiView.tsx';
import { KasbonUangView } from './components/kasir/KasbonUangView.tsx';
import { BayarBonView } from './components/kasir/BayarBonView.tsx';
import { TransferRekeningView } from './components/kasir/TransferRekeningView.tsx';
import { MasterRekeningView } from './components/master/MasterRekeningView.tsx';
import { MasterMitraView } from './components/master/MasterMitraView.tsx';
import { MasterProdukView } from './components/master/MasterProdukView.tsx';
import { MasterKaryawanView } from './components/karyawan/MasterKaryawanView.tsx';
import { DivisiKeuanganView } from './components/karyawan/DivisiKeuanganView.tsx';
import { StokBarangView } from './components/stok/StokBarangView.tsx';
import { StokHasilBumiView } from './components/stok/StokHasilBumiView.tsx';
import { RekeningKoranMitraView } from './components/laporan/RekeningKoranMitraView.tsx';
import { RekapTransaksiView } from './components/laporan/RekapTransaksiView.tsx';
import { AuditLogView } from './components/laporan/AuditLogView.tsx';
import { PrintReceiptModal, ReceiptData } from './components/common/PrintReceiptModal.tsx';
import { api, DashboardStatsResponse } from './api/client.ts';
import {
  AuditLog,
  Mitra,
  Produk,
  Rekening,
  StokBarang,
  StokHasilBumi,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianHasilBumi,
  TransaksiTransferRekening,
} from './server/types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Master & Transaction States
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [rekeningList, setRekeningList] = useState<Rekening[]>([]);
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [stokList, setStokList] = useState<StokBarang[]>([]);
  const [stokHasilBumiList, setStokHasilBumiList] = useState<StokHasilBumi[]>([]);
  const [pembelianList, setPembelianList] = useState<TransaksiPembelianHasilBumi[]>([]);
  const [kasbonUangList, setKasbonUangList] = useState<TransaksiKasbonUang[]>([]);
  const [bayarBonList, setBayarBonList] = useState<TransaksiBayarBon[]>([]);
  const [transferList, setTransferList] = useState<TransaksiTransferRekening[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMitraForStatement, setSelectedMitraForStatement] = useState<string>('');
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);

  const loadAllData = useCallback(async () => {
    try {
      const [
        dashboardStats,
        rekeningRes,
        mitraRes,
        produkRes,
        stokRes,
        hasilBumiRes,
        pembelianRes,
        kasbonUangRes,
        bayarBonRes,
        transferRes,
        logsRes,
      ] = await Promise.all([
        api.getDashboard(),
        api.getRekening(),
        api.getMitra(),
        api.getProduk(),
        api.getStok(),
        api.getStokHasilBumi(),
        api.getPembelianHasilBumi(),
        api.getKasbonUang(),
        api.getBayarBon(),
        api.getTransferRekening(),
        api.getAuditLogs(),
      ]);

      setStats(dashboardStats);
      setRekeningList(rekeningRes);
      setMitraList(mitraRes);
      setProdukList(produkRes);
      setStokList(stokRes);
      setStokHasilBumiList(hasilBumiRes);
      setPembelianList(pembelianRes);
      setKasbonUangList(kasbonUangRes);
      setBayarBonList(bayarBonRes);
      setTransferList(transferRes);
      setAuditLogs(logsRes);

      if (!selectedMitraForStatement && mitraRes.length > 0) {
        setSelectedMitraForStatement(mitraRes[0].id);
      }
    } catch (err) {
      console.error('Error loading ERP data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMitraForStatement]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleOpenMitraStatement = (idMitra: string) => {
    setSelectedMitraForStatement(idMitra);
    setActiveTab('rekening-koran-mitra');
  };

  const handleTransactionSuccess = (receipt: ReceiptData) => {
    setActiveReceipt(receipt);
    loadAllData();
  };

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col font-sans antialiased text-zinc-900">
      {/* Top App Header */}
      <Header rekeningList={rekeningList} onRefresh={loadAllData} />

      {/* Main Workspace: Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                stats={stats}
                loading={loading}
                onNavigate={setActiveTab}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'kasir-penjualan' && (
              <PenjualanView
                produkList={produkList}
                stokList={stokList}
                mitraList={mitraList}
                rekeningList={rekeningList}
                onSuccess={handleTransactionSuccess}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'kasir-pembelian' && (
              <PembelianHasilBumiView
                stokHasilBumiList={stokHasilBumiList}
                mitraList={mitraList}
                rekeningList={rekeningList}
                onSuccess={handleTransactionSuccess}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'kasir-kasbon-uang' && (
              <KasbonUangView
                mitraList={mitraList}
                rekeningList={rekeningList}
                kasbonUangList={kasbonUangList}
                onSuccess={handleTransactionSuccess}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'kasir-bayar-bon' && (
              <BayarBonView
                mitraList={mitraList}
                rekeningList={rekeningList}
                bayarBonList={bayarBonList}
                onSuccess={handleTransactionSuccess}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'kasir-transfer' && (
              <TransferRekeningView
                rekeningList={rekeningList}
                transferList={transferList}
                onSuccess={handleTransactionSuccess}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'master-produk' && (
              <MasterProdukView produkList={produkList} onRefresh={loadAllData} />
            )}

            {activeTab === 'master-mitra' && (
              <MasterMitraView
                mitraList={mitraList}
                onRefresh={loadAllData}
                onOpenStatement={handleOpenMitraStatement}
              />
            )}

            {activeTab === 'master-rekening' && (
              <MasterRekeningView rekeningList={rekeningList} onRefresh={loadAllData} />
            )}

            {activeTab === 'master-karyawan' && (
              <MasterKaryawanView
                rekeningList={rekeningList}
                initialTab="karyawan"
                onOpenStatement={(mitraId) => {
                  setSelectedMitraForStatement(mitraId);
                  setActiveTab('rekening-koran-mitra');
                }}
                onOpenKasbonUang={() => {
                  setActiveTab('kasir-kasbon-uang');
                }}
                onNavigateToDivisi={() => {
                  setActiveTab('menu-divisi');
                }}
                onRefreshAll={loadAllData}
              />
            )}

            {activeTab === 'menu-divisi' && (
              <DivisiKeuanganView
                rekeningList={rekeningList}
                onNavigateToKaryawan={() => {
                  setActiveTab('master-karyawan');
                }}
                onRefreshAll={loadAllData}
              />
            )}

            {activeTab === 'stok-barang' && (
              <StokBarangView stokList={stokList} onRefresh={loadAllData} />
            )}

            {activeTab === 'stok-hasil-bumi' && (
              <StokHasilBumiView
                stokList={stokHasilBumiList}
                pembelianList={pembelianList}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'rekening-koran-mitra' && (
              <RekeningKoranMitraView
                mitraList={mitraList}
                selectedMitraId={selectedMitraForStatement}
                onSelectMitra={setSelectedMitraForStatement}
              />
            )}

            {activeTab === 'laporan-transaksi' && (
              <RekapTransaksiView recentTransactions={stats?.recentTransactions || []} />
            )}

            {activeTab === 'audit-log' && (
              <AuditLogView logs={auditLogs} onRefresh={loadAllData} />
            )}
          </div>
        </main>
      </div>

      {/* Printable Receipt Modal */}
      <PrintReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
}
