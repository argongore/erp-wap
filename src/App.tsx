import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/layout/Header.tsx';
import { Sidebar, ActiveTab } from './components/layout/Sidebar.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { PenjualanView } from './components/kasir/PenjualanView.tsx';
import { PembelianBarangView } from './components/kasir/PembelianBarangView.tsx';
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
import { LabaRugiProdukView } from './components/laporan/LabaRugiProdukView.tsx';
import { RekeningKoranMitraView } from './components/laporan/RekeningKoranMitraView.tsx';
import { RekapTransaksiView } from './components/laporan/RekapTransaksiView.tsx';
import { AuditLogView } from './components/laporan/AuditLogView.tsx';
import { GoogleSheetsSyncView } from './components/sheets/GoogleSheetsSyncView.tsx';
import { DatabaseExplorerView } from './components/database/DatabaseExplorerView.tsx';
import { BillboardMonitoringView } from './components/billboard/BillboardMonitoringView.tsx';
import { PrintReceiptModal, ReceiptData } from './components/common/PrintReceiptModal.tsx';
import { api, DashboardStatsResponse } from './api/client.ts';
import {
  AuditLog,
  CatatanUpahHarian,
  Karyawan,
  Mitra,
  Produk,
  Rekening,
  StokBarang,
  StokHasilBumi,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
} from './server/types.ts';
import { FullErpModularDataset } from './utils/modularSpreadsheets.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Master & Transaction States
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [rekeningList, setRekeningList] = useState<Rekening[]>([]);
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [upahHarianList, setUpahHarianList] = useState<CatatanUpahHarian[]>([]);
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [stokList, setStokList] = useState<StokBarang[]>([]);
  const [stokHasilBumiList, setStokHasilBumiList] = useState<StokHasilBumi[]>([]);
  const [penjualanList, setPenjualanList] = useState<TransaksiPenjualan[]>([]);
  const [pembelianList, setPembelianList] = useState<TransaksiPembelianHasilBumi[]>([]);
  const [pembelianBarangList, setPembelianBarangList] = useState<TransaksiPembelianBarang[]>([]);
  const [kasbonUangList, setKasbonUangList] = useState<TransaksiKasbonUang[]>([]);
  const [bayarBonList, setBayarBonList] = useState<TransaksiBayarBon[]>([]);
  const [transferList, setTransferList] = useState<TransaksiTransferRekening[]>([]);
  const [penggajianList, setPenggajianList] = useState<TransaksiPenggajian[]>([]);
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
        karyawanRes,
        upahHarianRes,
        produkRes,
        stokRes,
        hasilBumiRes,
        penjualanRes,
        pembelianRes,
        pembelianBarangRes,
        kasbonUangRes,
        bayarBonRes,
        transferRes,
        penggajianRes,
        logsRes,
      ] = await Promise.all([
        api.getDashboard(),
        api.getRekening(),
        api.getMitra(),
        api.getKaryawan().catch(() => []),
        api.getUpahHarianList().catch(() => []),
        api.getProduk(),
        api.getStok(),
        api.getStokHasilBumi(),
        api.getPenjualan().catch(() => []),
        api.getPembelianHasilBumi(),
        api.getPembelianBarang().catch(() => []),
        api.getKasbonUang(),
        api.getBayarBon(),
        api.getTransferRekening(),
        api.getPenggajian().catch(() => []),
        api.getAuditLogs(),
      ]);

      setStats(dashboardStats);
      setRekeningList(rekeningRes);
      setMitraList(mitraRes);
      setKaryawanList(karyawanRes);
      setUpahHarianList(upahHarianRes);
      setProdukList(produkRes);
      setStokList(stokRes);
      setStokHasilBumiList(hasilBumiRes);
      setPenjualanList(penjualanRes);
      setPembelianList(pembelianRes);
      setPembelianBarangList(pembelianBarangRes);
      setKasbonUangList(kasbonUangRes);
      setBayarBonList(bayarBonRes);
      setTransferList(transferRes);
      setPenggajianList(penggajianRes);
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

  const fullErpData: FullErpModularDataset = {
    rekeningList,
    mitraList,
    karyawanList,
    upahHarianList,
    produkList,
    stokList,
    stokHasilBumiList,
    penjualanList,
    pembelianList,
    pembelianBarangList,
    kasbonUangList,
    bayarBonList,
    transferList,
    penggajianList,
    auditLogs,
  };

  return (
    <div className="h-screen w-full bg-zinc-100 flex flex-col font-sans antialiased text-zinc-900 overflow-hidden">
      {/* Top App Header (Fixed at top) */}
      <Header
        rekeningList={rekeningList}
        onRefresh={loadAllData}
        onOpenSheetsSync={() => setActiveTab('google-sheets-sync')}
        onOpenBillboard={() => setActiveTab('billboard-monitor')}
      />

      {/* Main Workspace: Sidebar (Frozen/Locked) + Content Area (Independently Scrollable) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className={`flex-1 overflow-y-auto min-h-0 ${activeTab === 'billboard-monitor' ? 'p-2 sm:p-4 bg-slate-950' : 'p-4 sm:p-6 lg:p-8'}`}>
          <div className={activeTab === 'billboard-monitor' ? 'w-full h-full' : 'max-w-7xl mx-auto'}>
            {activeTab === 'dashboard' && (
              <DashboardView
                stats={stats}
                loading={loading}
                onNavigate={setActiveTab}
                onRefresh={loadAllData}
              />
            )}

            {activeTab === 'billboard-monitor' && (
              <BillboardMonitoringView onClose={() => setActiveTab('dashboard')} />
            )}

            {activeTab === 'kasir-penjualan' && (
              <PenjualanView
                produkList={produkList}
                stokList={stokList}
                mitraList={mitraList}
                rekeningList={rekeningList}
                onSuccess={handleTransactionSuccess}
                onRefresh={loadAllData}
                onOpenLabaRugi={() => setActiveTab('laba-rugi-produk')}
              />
            )}

            {activeTab === 'kasir-pembelian-barang' && (
              <PembelianBarangView
                produkList={produkList}
                stokList={stokList}
                mitraList={mitraList}
                rekeningList={rekeningList}
                onSuccess={handleTransactionSuccess}
                onRefresh={loadAllData}
                onOpenLabaRugi={() => setActiveTab('laba-rugi-produk')}
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
                fullErpData={fullErpData}
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
                fullErpData={fullErpData}
                initialTab="rekap"
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

            {activeTab === 'laba-rugi-produk' && (
              <LabaRugiProdukView
                onNavigateToKasir={() => setActiveTab('kasir-penjualan')}
                onNavigateToKulakan={() => setActiveTab('kasir-pembelian-barang')}
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

            {activeTab === 'google-sheets-sync' && (
              <DatabaseExplorerView
                erpData={fullErpData}
                onRefreshAll={loadAllData}
                onNavigateToTab={(t) => setActiveTab(t as ActiveTab)}
              />
            )}
          </div>
        </main>
      </div>

      {/* Printable Receipt Modal */}
      <PrintReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
}
