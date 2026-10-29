import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Scale,
  Package,
  Wallet,
  Calendar,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  Mitra,
  Produk,
  Rekening,
  StokBarang,
  StokHasilBumi,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';

export interface ModalEditTransaksiUniversalProps {
  isOpen: boolean;
  transactionId: string | null;
  jenisHint?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type JenisTransaksiEdit =
  | 'PENJUALAN'
  | 'PEMBELIAN_BARANG'
  | 'PEMBELIAN_HASIL_BUMI'
  | 'PENJUALAN_HASIL_BUMI'
  | 'KASBON_UANG'
  | 'BAYAR_BON'
  | 'PENCAIRAN_TITIPAN'
  | 'PENGELUARAN_DIVISI'
  | 'TRANSFER_REKENING'
  | 'UPAH_HARIAN'
  | 'PENGGAJIAN';

interface EditableLineItem {
  kodeProduk: string;
  namaProduk: string;
  satuan: string;
  qty: string;
  hargaSatuan: string;
}

function dmyToIsoDate(dmy: string): string {
  if (!dmy) return '';
  const clean = dmy.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return '';
}

function isoToDmyDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.trim().split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return iso;
}

const JENIS_LABEL_MAP: Record<JenisTransaksiEdit, string> = {
  PEMBELIAN_HASIL_BUMI: 'Pembelian Hasil Bumi (Timbangan / Dana Mitra)',
  PENJUALAN_HASIL_BUMI: 'Penjualan Hasil Bumi Keluar Gudang',
  PEMBELIAN_BARANG: 'Pembelian Barang Dagang (Kulakan Pemasok)',
  PENJUALAN: 'Penjualan Kasir Toko / Saprotan',
  KASBON_UANG: 'Kasbon Uang & Piutang Nota Lalu',
  BAYAR_BON: 'Pelunasan / Pembayaran Bon Mitra',
  PENCAIRAN_TITIPAN: 'Pencairan Saldo Titipan Hasil Bumi',
  PENGELUARAN_DIVISI: 'Pengeluaran & Biaya Operasional Divisi',
  TRANSFER_REKENING: 'Mutasi / Transfer Antar Rekening',
  UPAH_HARIAN: 'Catatan Upah Kerja Harian Karyawan',
  PENGGAJIAN: 'Slip Pencairan Gaji Karyawan',
};

export const ModalEditTransaksiUniversal: React.FC<ModalEditTransaksiUniversalProps> = ({
  isOpen,
  transactionId,
  jenisHint,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  const [jenis, setJenis] = useState<JenisTransaksiEdit | null>(null);
  const [record, setRecord] = useState<any>(null);
  const [masters, setMasters] = useState<{
    rekeningList: Rekening[];
    produkList: Produk[];
    stokBarangList: StokBarang[];
    stokHasilBumiList: StokHasilBumi[];
    mitraList: Mitra[];
    divisiList: Array<{ id: string; nama: string; kodeRekening: string }>;
  }>({
    rekeningList: [],
    produkList: [],
    stokBarangList: [],
    stokHasilBumiList: [],
    mitraList: [],
    divisiList: [],
  });

  // Common Form Fields
  const [tanggalDmy, setTanggalDmy] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [modePihak, setModePihak] = useState<'MITRA' | 'MANUAL'>('MITRA');
  const [idMitra, setIdMitra] = useState('');
  const [namaMitraManual, setNamaMitraManual] = useState('');

  // Payment & Account Fields
  const [metode, setMetode] = useState('');
  const [rekeningSumber, setRekeningSumber] = useState('');
  const [rekeningTujuan, setRekeningTujuan] = useState('');
  const [nominalInput, setNominalInput] = useState('');

  // Hasil Bumi Tonase & Harga Fields
  const [komoditasKode, setKomoditasKode] = useState('');
  const [beratKotorInput, setBeratKotorInput] = useState('');
  const [rafaksiInput, setRafaksiInput] = useState('');
  const [useManualNetto, setUseManualNetto] = useState(false);
  const [beratBersihManualInput, setBeratBersihManualInput] = useState('');
  const [hargaPerKgInput, setHargaPerKgInput] = useState('');
  const [isBelumPutusHarga, setIsBelumPutusHarga] = useState(false);
  const [noSuratJalan, setNoSuratJalan] = useState('');
  const [noNotaLalu, setNoNotaLalu] = useState('');
  const [rincianBarangNotaLalu, setRincianBarangNotaLalu] = useState('');

  // Multi-item Barang Fields
  const [noFakturSupplier, setNoFakturSupplier] = useState('');
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);

  // Pengeluaran / Upah / Gaji Fields
  const [divisi, setDivisi] = useState('');
  const [kategoriBiaya, setKategoriBiaya] = useState('');
  const [penerima, setPenerima] = useState('');
  const [itemKerja, setItemKerja] = useState('');
  const [kuantitiUpahInput, setKuantitiUpahInput] = useState('');
  const [hargaSatuanUpahInput, setHargaSatuanUpahInput] = useState('');
  const [uangMakanLemburInput, setUangMakanLemburInput] = useState('');
  const [catatanKerja, setCatatanKerja] = useState('');
  const [gajiPokokInput, setGajiPokokInput] = useState('');
  const [tunjanganInput, setTunjanganInput] = useState('');
  const [bonusInput, setBonusInput] = useState('');
  const [potonganKasbonInput, setPotonganKasbonInput] = useState('');
  const [periodeBulan, setPeriodeBulan] = useState('');

  useEffect(() => {
    if (!isOpen || !transactionId) return;

    let cancelled = false;
    const fetchDetail = async () => {
      setLoading(true);
      setLoadError('');
      setSaveError('');
      setSaveSuccess('');
      try {
        const res = await api.getTransactionDetail(transactionId, jenisHint);
        if (cancelled) return;

        const r = res.record;
        const j = res.jenis;
        setJenis(j);
        setRecord(r);
        setMasters(res.masters);

        // Hydrate common fields
        setTanggalDmy(r.tanggal || r.tanggalKerja || '');
        setKeterangan(r.keterangan || '');

        const hasRegisteredMitra =
          r.idMitra &&
          r.idMitra !== 'UMUM' &&
          r.idMitra !== 'MANUAL-DIST' &&
          res.masters.mitraList.some((m) => m.id === r.idMitra);

        setModePihak(hasRegisteredMitra ? 'MITRA' : 'MANUAL');
        setIdMitra(hasRegisteredMitra ? r.idMitra : res.masters.mitraList[0]?.id || '');
        setNamaMitraManual(r.namaMitra || r.namaDistributorManual || '');

        // Hydrate per-type fields
        const defaultTransferBank =
          res.masters.rekeningList.find(
            (rk) =>
              !rk.isVirtual &&
              rk.kategori !== 'OPERASIONAL_DIVISI' &&
              rk.kode !== 'KAS01' &&
              rk.kode !== 'BON01' &&
              rk.kode !== 'TIT01' &&
              rk.kode !== 'SINKRON' &&
              rk.status === 'AKTIF'
          )?.kode || 'BNI01';

        if (j === 'PEMBELIAN_HASIL_BUMI') {
          setDivisi(r.divisi || 'Gudang Wijaya Agro');
          setKomoditasKode(r.komoditasKode || res.masters.stokHasilBumiList[0]?.kode || '');
          const kotor = Number(r.beratKotor) || 0;
          const raf = Number(r.potonganRafaksi) || 0;
          const bersih = Number(r.beratBersih) || 0;
          const computedNet = Math.round(kotor * (1 - raf / 100) * 100) / 100;
          setBeratKotorInput(String(kotor));
          setRafaksiInput(String(raf));
          const isCustomNet = kotor > 0 && Math.abs(computedNet - bersih) > 0.05;
          setUseManualNetto(isCustomNet);
          setBeratBersihManualInput(String(bersih));
          setHargaPerKgInput(String(Number(r.hargaPerKg) || 0));
          setIsBelumPutusHarga(Boolean(r.isBelumPutusHarga || r.status === 'BELUM_PUTUS_HARGA'));
          setMetode(r.metodePembayaran || 'TUNAI');
          setRekeningSumber(
            r.rekeningSumber && r.rekeningSumber !== 'TIT01' && r.rekeningSumber !== 'KAS01'
              ? r.rekeningSumber
              : defaultTransferBank
          );
          setNominalInput(String(Number(r.totalNominal) || 0));
          setNoNotaLalu(r.noNotaLalu || '');
        } else if (j === 'PENJUALAN_HASIL_BUMI') {
          setDivisi(r.divisi || 'PT Wijaya Agro Perkasa');
          setKomoditasKode(r.komoditasKode || res.masters.stokHasilBumiList[0]?.kode || '');
          const kotor = Number(r.beratKotor) || 0;
          const raf = Number(r.potonganRafaksi) || 0;
          const bersih = Number(r.beratBersih) || 0;
          const computedNet = Math.round(kotor * (1 - raf / 100) * 100) / 100;
          setBeratKotorInput(String(kotor));
          setRafaksiInput(String(raf));
          const isCustomNet = kotor > 0 && Math.abs(computedNet - bersih) > 0.05;
          setUseManualNetto(isCustomNet);
          setBeratBersihManualInput(String(bersih));
          setHargaPerKgInput(String(Number(r.hargaJualPerKg) || 0));
          setNoSuratJalan(r.noSuratJalan || '');
          setMetode(r.metodePembayaran || 'TUNAI');
          setRekeningTujuan(
            r.rekeningTujuan && r.rekeningTujuan !== 'BON01' && r.rekeningTujuan !== 'KAS01'
              ? r.rekeningTujuan
              : defaultTransferBank
          );
          setNominalInput(String(Number(r.totalNominal) || 0));
        } else if (j === 'PEMBELIAN_BARANG') {
          setDivisi(r.divisi || 'CV Wijaya Agro');
          setNoFakturSupplier(r.noFakturSupplier || '');
          setMetode(r.metodePembayaran || 'TUNAI');
          setRekeningSumber(
            r.rekeningSumber && r.rekeningSumber !== 'TIT01' && r.rekeningSumber !== 'KAS01'
              ? r.rekeningSumber
              : defaultTransferBank
          );
          setNominalInput(String(Number(r.totalNominal) || 0));
          setLineItems(
            (r.items || []).map((it: any) => ({
              kodeProduk: it.kodeProduk || '',
              namaProduk: it.namaProduk || '',
              satuan: it.satuan || 'Unit',
              qty: String(Number(it.qty) || 1),
              hargaSatuan: String(Number(it.hargaBeliSatuan) || 0),
            }))
          );
        } else if (j === 'PENJUALAN') {
          setDivisi(
            r.divisi ||
              (r.metode === 'INTERNAL_PT' ? 'PT Wijaya Agro Perkasa' : 'CV Wijaya Agro')
          );
          setMetode(r.metode || 'TUNAI');
          setRekeningTujuan(
            r.rekeningTujuan &&
              r.rekeningTujuan !== 'BON01' &&
              r.rekeningTujuan !== 'KAS01' &&
              r.rekeningTujuan !== 'INTERNAL_PT'
              ? r.rekeningTujuan
              : defaultTransferBank
          );
          setNominalInput(String(Number(r.totalNominal) || 0));
          setLineItems(
            (r.items || []).map((it: any) => ({
              kodeProduk: it.kodeProduk || '',
              namaProduk: it.namaProduk || '',
              satuan: it.satuan || 'Unit',
              qty: String(Number(it.qty) || 1),
              hargaSatuan: String(Number(it.harga) || 0),
            }))
          );
        } else if (j === 'KASBON_UANG') {
          setNominalInput(String(Number(r.nominal) || 0));
          setMetode(r.metode || 'TUNAI');
          setRekeningSumber(
            r.rekeningSumber && r.rekeningSumber !== 'BON01' && r.rekeningSumber !== 'KAS01'
              ? r.rekeningSumber
              : res.masters.rekeningList.find((rk) => !rk.isVirtual && rk.kode !== 'KAS01' && rk.status === 'AKTIF')?.kode || 'BNI01'
          );
          setNoNotaLalu(r.noNotaLalu || '');
          setRincianBarangNotaLalu(r.rincianBarangNotaLalu || '');
        } else if (j === 'BAYAR_BON') {
          setNominalInput(String(Number(r.nominalBayar) || 0));
          setMetode(r.metode || 'TUNAI');
          setRekeningTujuan(
            r.rekeningTujuan && r.rekeningTujuan !== 'BON01' && r.rekeningTujuan !== 'KAS01'
              ? r.rekeningTujuan
              : res.masters.rekeningList.find((rk) => !rk.isVirtual && rk.kode !== 'KAS01' && rk.status === 'AKTIF')?.kode || 'BNI01'
          );
        } else if (j === 'PENCAIRAN_TITIPAN') {
          setNominalInput(String(Number(r.nominalPencairan) || 0));
          setMetode(r.metodePembayaran || 'TUNAI');
          setRekeningSumber(
            r.rekeningSumber && r.rekeningSumber !== 'TIT01' && r.rekeningSumber !== 'KAS01'
              ? r.rekeningSumber
              : res.masters.rekeningList.find((rk) => !rk.isVirtual && rk.kode !== 'KAS01' && rk.status === 'AKTIF')?.kode || 'BNI01'
          );
        } else if (j === 'PENGELUARAN_DIVISI') {
          setNominalInput(String(Number(r.nominal) || 0));
          setRekeningSumber(r.rekeningSumber || 'KAS01');
          setDivisi(r.divisi || 'Gudang Wijaya Agro');
          setKategoriBiaya(r.kategori || 'Operasional Umum');
          setPenerima(r.penerima || '');
        } else if (j === 'TRANSFER_REKENING') {
          setNominalInput(String(Number(r.nominal) || 0));
          setRekeningSumber(r.rekeningSumber || 'KAS01');
          setRekeningTujuan(r.rekeningTujuan || 'BNI01');
        } else if (j === 'UPAH_HARIAN') {
          const qty = r.kuantiti !== undefined ? Number(r.kuantiti) : 1;
          const harga =
            r.harga !== undefined
              ? Number(r.harga)
              : Number(r.upahHarian || r.totalUpahHarian || 0);
          setDivisi(r.divisi || 'Gudang Wijaya Agro');
          setItemKerja(r.item || r.keterangan || '');
          setKuantitiUpahInput(String(qty));
          setHargaSatuanUpahInput(String(harga));
          setUangMakanLemburInput(String(Number(r.uangMakanLembur) || 0));
          setCatatanKerja(r.catatan || '');
        } else if (j === 'PENGGAJIAN') {
          setDivisi(r.divisi || 'Gudang Wijaya Agro');
          setPeriodeBulan(r.periodeBulan || '');
          setGajiPokokInput(String(Number(r.gajiPokok) || 0));
          setTunjanganInput(String(Number(r.tunjangan) || 0));
          setBonusInput(String(Number(r.bonus) || 0));
          setPotonganKasbonInput(String(Number(r.potonganKasbon) || 0));
          setRekeningSumber(r.rekeningSumber || 'KAS01');
          setMetode(r.metodePembayaran || (r.rekeningSumber === 'KAS01' ? 'TUNAI' : 'TRANSFER'));
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err.message || 'Gagal memuat detail transaksi');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [isOpen, transactionId, jenisHint]);

  const activeRealAccounts = useMemo(
    () =>
      masters.rekeningList.filter(
        (r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01' && r.status === 'AKTIF'
      ),
    [masters.rekeningList]
  );

  const activeBankAccounts = useMemo(
    () =>
      activeRealAccounts.filter(
        (r) => r.kode !== 'KAS01' && r.kategori !== 'OPERASIONAL_DIVISI' && r.kode !== 'SINKRON'
      ),
    [activeRealAccounts]
  );

  const activeMitras = useMemo(
    () => masters.mitraList.filter((m) => m.status === 'AKTIF'),
    [masters.mitraList]
  );

  const isNonPhysicalHasilBumi = useMemo(() => {
    if (jenis !== 'PEMBELIAN_HASIL_BUMI' || !record) return false;
    return (
      record.komoditasKode === 'PINJAMAN_DANA' ||
      record.komoditasKode === 'TITIP_DANA' ||
      Boolean(record.komoditasNama?.toLowerCase().includes('pinjaman uang')) ||
      (Number(record.beratBersih) === 0 && Number(record.beratKotor) === 0)
    );
  }, [jenis, record]);

  const isRekapNotaBarang = useMemo(() => {
    if (jenis !== 'PEMBELIAN_BARANG' || !record) return false;
    return lineItems.length === 1 && lineItems[0]?.kodeProduk === 'REKAP-NOTA';
  }, [jenis, record, lineItems]);

  // Live Calculations for Hasil Bumi
  const computedBeratBersih = useMemo(() => {
    if (useManualNetto) {
      return Math.max(0, Math.round((Number(beratBersihManualInput) || 0) * 100) / 100);
    }
    const kotor = Math.max(0, Number(beratKotorInput) || 0);
    const raf = Math.min(99.9, Math.max(0, Number(rafaksiInput) || 0));
    return Math.round(kotor * (1 - raf / 100) * 100) / 100;
  }, [useManualNetto, beratBersihManualInput, beratKotorInput, rafaksiInput]);

  const selectedKomoditasObj = useMemo(
    () => masters.stokHasilBumiList.find((k) => k.kode === komoditasKode),
    [masters.stokHasilBumiList, komoditasKode]
  );

  // Live Total Nominal Preview across types
  const liveNominalBaru = useMemo(() => {
    if (!jenis) return 0;
    if ((jenis === 'PEMBELIAN_HASIL_BUMI' && !isNonPhysicalHasilBumi) || jenis === 'PENJUALAN_HASIL_BUMI') {
      if (jenis === 'PEMBELIAN_HASIL_BUMI' && isBelumPutusHarga && (Number(hargaPerKgInput) || 0) === 0) {
        return 0;
      }
      return Math.round(computedBeratBersih * (Number(hargaPerKgInput) || 0));
    }
    if ((jenis === 'PENJUALAN' || jenis === 'PEMBELIAN_BARANG') && !isRekapNotaBarang) {
      return lineItems.reduce((sum, it) => {
        const q = Math.max(0, Number(it.qty) || 0);
        const h = Math.max(0, Number(it.hargaSatuan) || 0);
        return sum + Math.round(q * h);
      }, 0);
    }
    if (jenis === 'UPAH_HARIAN') {
      const q = Math.max(0, Number(kuantitiUpahInput) || 0);
      const h = Math.max(0, Number(hargaSatuanUpahInput) || 0);
      const m = Math.max(0, Number(uangMakanLemburInput) || 0);
      return Math.round(q * h) + Math.round(m);
    }
    if (jenis === 'PENGGAJIAN') {
      const pokok = Math.max(0, Number(gajiPokokInput) || 0);
      const tunj = Math.max(0, Number(tunjanganInput) || 0);
      const bon = Math.max(0, Number(bonusInput) || 0);
      const pot = Math.max(0, Number(potonganKasbonInput) || 0);
      return Math.max(0, pokok + tunj + bon - pot);
    }
    return Math.max(0, Math.round(Number(nominalInput) || 0));
  }, [
    jenis,
    isNonPhysicalHasilBumi,
    isBelumPutusHarga,
    computedBeratBersih,
    hargaPerKgInput,
    isRekapNotaBarang,
    lineItems,
    kuantitiUpahInput,
    hargaSatuanUpahInput,
    uangMakanLemburInput,
    gajiPokokInput,
    tunjanganInput,
    bonusInput,
    potonganKasbonInput,
    nominalInput,
  ]);

  const oldNominal = useMemo(() => {
    if (!record || !jenis) return 0;
    if (jenis === 'BAYAR_BON') return Number(record.nominalBayar) || 0;
    if (jenis === 'PENCAIRAN_TITIPAN') return Number(record.nominalPencairan) || 0;
    if (jenis === 'UPAH_HARIAN') {
      return Number(record.totalUpahHarian || record.jumlah || record.upahHarian) || 0;
    }
    if (jenis === 'PENGGAJIAN') return Number(record.gajiBersihDibayar) || 0;
    return Number(record.totalNominal ?? record.nominal ?? 0);
  }, [record, jenis]);

  if (!isOpen || !transactionId) return null;

  const handleProductRowChange = (index: number, newKode: string) => {
    const prod = masters.produkList.find((p) => p.kode === newKode);
    setLineItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        if (!prod) return { ...row, kodeProduk: newKode };
        const defaultHarga =
          jenis === 'PEMBELIAN_BARANG'
            ? prod.hargaBeli || 0
            : prod.hargaJual > 0
            ? prod.hargaJual
            : prod.hargaBeli || 0;
        return {
          kodeProduk: prod.kode,
          namaProduk: prod.nama,
          satuan: prod.satuan,
          qty: row.qty || '1',
          hargaSatuan: String(defaultHarga),
        };
      })
    );
  };

  const handleAddLineItem = () => {
    const firstProd = masters.produkList.find((p) => p.status === 'AKTIF') || masters.produkList[0];
    if (!firstProd) return;
    const defaultHarga =
      jenis === 'PEMBELIAN_BARANG'
        ? firstProd.hargaBeli || 0
        : firstProd.hargaJual > 0
        ? firstProd.hargaJual
        : firstProd.hargaBeli || 0;
    setLineItems((prev) => [
      ...prev,
      {
        kodeProduk: firstProd.kode,
        namaProduk: firstProd.nama,
        satuan: firstProd.satuan,
        qty: '1',
        hargaSatuan: String(defaultHarga),
      },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jenis || !record) return;

    setSaveError('');
    setSaveSuccess('');
    setSaving(true);

    try {
      const payload: Parameters<typeof api.editTransactionDetail>[0] = {
        idTransaksi: transactionId,
        jenis,
        tanggal: tanggalDmy.trim() || undefined,
        keterangan,
      };

      // Party updates for mitra-aware transaction types
      if (
        jenis === 'PEMBELIAN_HASIL_BUMI' ||
        jenis === 'PENJUALAN_HASIL_BUMI' ||
        jenis === 'PEMBELIAN_BARANG' ||
        jenis === 'PENJUALAN' ||
        jenis === 'KASBON_UANG'
      ) {
        if (modePihak === 'MITRA' && idMitra) {
          payload.idMitra = idMitra;
        } else {
          payload.idMitra = jenis === 'PEMBELIAN_BARANG' ? 'MANUAL' : 'UMUM';
          payload.namaMitraManual = namaMitraManual.trim() || record.namaMitra || 'Umum';
        }
      }

      if (jenis === 'PEMBELIAN_HASIL_BUMI') {
        payload.divisi = divisi;
        if (isNonPhysicalHasilBumi) {
          payload.nominal = Math.round(Number(nominalInput) || 0);
          payload.rekeningSumber = rekeningSumber || record.rekeningSumber;
          payload.noNotaLalu = noNotaLalu;
        } else {
          payload.komoditasKode = komoditasKode;
          payload.beratKotor = Number(beratKotorInput) || 0;
          payload.potonganRafaksi = Number(rafaksiInput) || 0;
          if (useManualNetto) {
            payload.beratBersihManual = Number(beratBersihManualInput) || 0;
          }
          payload.isBelumPutusHarga = isBelumPutusHarga;
          payload.hargaPerKg = Number(hargaPerKgInput) || 0;
          payload.metode = isBelumPutusHarga ? 'TITIP' : metode;
          if (metode === 'TRANSFER' && !isBelumPutusHarga) {
            payload.rekeningSumber = rekeningSumber;
          }
          payload.noNotaLalu = noNotaLalu;
        }
      } else if (jenis === 'PENJUALAN_HASIL_BUMI') {
        payload.divisi = divisi;
        payload.komoditasKode = komoditasKode;
        payload.beratKotor = Number(beratKotorInput) || 0;
        payload.potonganRafaksi = Number(rafaksiInput) || 0;
        if (useManualNetto) {
          payload.beratBersihManual = Number(beratBersihManualInput) || 0;
        }
        payload.hargaJualPerKg = Number(hargaPerKgInput) || 0;
        payload.noSuratJalan = noSuratJalan;
        payload.metode = metode;
        if (metode === 'TRANSFER') {
          payload.rekeningTujuan = rekeningTujuan;
        }
      } else if (jenis === 'PEMBELIAN_BARANG') {
        payload.divisi = divisi;
        payload.noFakturSupplier = noFakturSupplier;
        payload.metode = metode;
        if (metode === 'TRANSFER') {
          payload.rekeningSumber = rekeningSumber;
        }
        if (isRekapNotaBarang) {
          payload.nominal = Math.round(Number(nominalInput) || 0);
          payload.items = [
            {
              kodeProduk: 'REKAP-NOTA',
              namaProduk: lineItems[0]?.namaProduk || 'Rekapan Nota Pembelian',
              satuan: 'Nota',
              qty: 1,
              hargaBeliSatuan: Math.round(Number(nominalInput) || 0),
            },
          ];
        } else {
          payload.items = lineItems.map((it) => ({
            kodeProduk: it.kodeProduk,
            namaProduk: it.namaProduk,
            satuan: it.satuan,
            qty: Number(it.qty) || 0,
            hargaBeliSatuan: Math.round(Number(it.hargaSatuan) || 0),
          }));
        }
      } else if (jenis === 'PENJUALAN') {
        payload.divisi = divisi;
        payload.metode = metode;
        if (metode === 'TRANSFER') {
          payload.rekeningTujuan = rekeningTujuan;
        }
        payload.items = lineItems.map((it) => ({
          kodeProduk: it.kodeProduk,
          namaProduk: it.namaProduk,
          satuan: it.satuan,
          qty: Number(it.qty) || 0,
          harga: Math.round(Number(it.hargaSatuan) || 0),
        }));
      } else if (jenis === 'KASBON_UANG') {
        payload.nominal = Math.round(Number(nominalInput) || 0);
        const isNotaLaluRecord = Boolean(record.isNotaLalu || record.rekeningSumber === 'BON01');
        if (!isNotaLaluRecord) {
          payload.metode = metode;
          payload.rekeningSumber = metode === 'TUNAI' ? 'KAS01' : rekeningSumber;
        } else {
          payload.noNotaLalu = noNotaLalu;
          payload.rincianBarangNotaLalu = rincianBarangNotaLalu;
        }
      } else if (jenis === 'BAYAR_BON') {
        payload.nominal = Math.round(Number(nominalInput) || 0);
        const isNonTunaiBon =
          record.metode === 'KOMPENSASI_TITIP' ||
          record.metode === 'POTONG_GAJI' ||
          Boolean(record.isKompensasiTitipan) ||
          Boolean(record.isPotongGaji);
        if (!isNonTunaiBon) {
          payload.metode = metode;
          payload.rekeningTujuan = metode === 'TUNAI' ? 'KAS01' : rekeningTujuan;
        }
      } else if (jenis === 'PENCAIRAN_TITIPAN') {
        payload.nominal = Math.round(Number(nominalInput) || 0);
        const isKompensasi =
          record.metodePembayaran === 'KOMPENSASI_BON' || Boolean(record.isKompensasiBon);
        if (!isKompensasi) {
          payload.metode = metode;
          payload.rekeningSumber = metode === 'TUNAI' ? 'KAS01' : rekeningSumber;
        }
      } else if (jenis === 'PENGELUARAN_DIVISI') {
        payload.nominal = Math.round(Number(nominalInput) || 0);
        payload.rekeningSumber = rekeningSumber;
        payload.divisi = divisi;
        payload.kategori = kategoriBiaya;
        payload.penerima = penerima;
      } else if (jenis === 'TRANSFER_REKENING') {
        payload.nominal = Math.round(Number(nominalInput) || 0);
        payload.rekeningSumber = rekeningSumber;
        payload.rekeningTujuan = rekeningTujuan;
      } else if (jenis === 'UPAH_HARIAN') {
        payload.divisi = divisi;
        payload.itemKerja = itemKerja;
        payload.kuantiti = Number(kuantitiUpahInput) || 0;
        payload.hargaSatuanUpah = Math.round(Number(hargaSatuanUpahInput) || 0);
        payload.uangMakanLembur = Math.round(Number(uangMakanLemburInput) || 0);
        payload.catatanKerja = catatanKerja;
      } else if (jenis === 'PENGGAJIAN') {
        payload.divisi = divisi;
        payload.periodeBulan = periodeBulan;
        payload.gajiPokok = Math.round(Number(gajiPokokInput) || 0);
        payload.tunjangan = Math.round(Number(tunjanganInput) || 0);
        payload.bonus = Math.round(Number(bonusInput) || 0);
        payload.potonganKasbon = Math.round(Number(potonganKasbonInput) || 0);
        payload.rekeningSumber = rekeningSumber;
        payload.metode = rekeningSumber === 'KAS01' ? 'TUNAI' : 'TRANSFER';
      }

      const res = await api.editTransactionDetail(payload);
      setSaveSuccess(res.message || 'Detail transaksi berhasil diperbarui.');
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 450);
    } catch (err: any) {
      setSaveError(err.message || 'Gagal menyimpan perubahan transaksi');
    } finally {
      setSaving(false);
    }
  };

  const allDivisiOptions = useMemo(() => {
    const names = new Set<string>([
      'Gudang Wijaya Agro',
      'Wijaya Transport',
      'Wijaya Karya',
      'PT Wijaya Agro Perkasa',
      'CV Wijaya Agro',
      'Okussa',
      'BRILink',
    ]);
    masters.divisiList.forEach((d) => {
      if (d.nama) names.add(d.nama);
    });
    if (divisi) names.add(divisi);
    return Array.from(names);
  }, [masters.divisiList, divisi]);

  const oldKg = Number(record?.beratBersih) || 0;
  const selisihKgGudang =
    jenis === 'PEMBELIAN_HASIL_BUMI' && !isNonPhysicalHasilBumi
      ? Math.round((computedBeratBersih - oldKg) * 100) / 100
      : jenis === 'PENJUALAN_HASIL_BUMI'
      ? Math.round((oldKg - computedBeratBersih) * 100) / 100
      : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col text-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 text-white flex items-start justify-between gap-3 border-b border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">
              Edit Detail Transaksi
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-300 mt-0.5">
              <span className="font-mono font-semibold text-amber-300">{transactionId}</span>
              {jenis && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{JENIS_LABEL_MAP[jenis]}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="p-10 flex flex-col items-center justify-center space-y-2.5 text-xs text-zinc-600">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-700" />
            <span className="font-semibold">Memuat rincian transaksi &amp; saldo terkait...</span>
          </div>
        ) : loadError ? (
          <div className="p-6 space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Gagal membuka detail transaksi</p>
                <p className="mt-0.5">{loadError}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        ) : jenis && record ? (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
            <div className="p-5 space-y-4 text-xs flex-1 overflow-y-auto">
              {saveError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{saveError}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{saveSuccess}</span>
                </div>
              )}

              {/* Live Comparison Summary Card */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                    Nominal Awal
                  </span>
                  <div
                    className="text-sm font-bold font-mono tabular-nums text-zinc-700 truncate whitespace-nowrap mt-0.5"
                    title={formatRupiah(oldNominal)}
                  >
                    {formatRupiahSingkat(oldNominal)}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-zinc-500 truncate">
                    {formatRupiah(oldNominal)}
                  </div>
                </div>

                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                    Nominal Koreksi Baru
                  </span>
                  <div
                    className="text-sm font-bold font-mono tabular-nums text-emerald-800 truncate whitespace-nowrap mt-0.5"
                    title={formatRupiah(liveNominalBaru)}
                  >
                    {formatRupiahSingkat(liveNominalBaru)}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-emerald-700 truncate">
                    {formatRupiah(liveNominalBaru)}
                  </div>
                </div>

                {((jenis === 'PEMBELIAN_HASIL_BUMI' && !isNonPhysicalHasilBumi) ||
                  jenis === 'PENJUALAN_HASIL_BUMI') ? (
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                      Efek Stok Gudang
                    </span>
                    <div className="text-sm font-bold font-mono tabular-nums text-zinc-900 truncate whitespace-nowrap mt-0.5">
                      {oldKg.toLocaleString('id-ID')} → {computedBeratBersih.toLocaleString('id-ID')} Kg
                    </div>
                    <div
                      className={`text-[10px] font-mono tabular-nums font-semibold ${
                        selisihKgGudang > 0
                          ? 'text-emerald-700'
                          : selisihKgGudang < 0
                          ? 'text-amber-700'
                          : 'text-zinc-500'
                      }`}
                    >
                      {selisihKgGudang > 0
                        ? `+${selisihKgGudang.toLocaleString('id-ID')} Kg ke Gudang`
                        : selisihKgGudang < 0
                        ? `${selisihKgGudang.toLocaleString('id-ID')} Kg dari Gudang`
                        : 'Tonase tetap'}
                    </div>
                  </div>
                ) : (
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                      Selisih Nominal
                    </span>
                    <div
                      className={`text-sm font-bold font-mono tabular-nums truncate whitespace-nowrap mt-0.5 ${
                        liveNominalBaru - oldNominal === 0
                          ? 'text-zinc-600'
                          : liveNominalBaru - oldNominal > 0
                          ? 'text-sky-700'
                          : 'text-amber-700'
                      }`}
                      title={formatRupiah(liveNominalBaru - oldNominal)}
                    >
                      {liveNominalBaru - oldNominal > 0 ? '+' : ''}
                      {formatRupiahSingkat(liveNominalBaru - oldNominal)}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      Sinkron otomatis ke buku kas &amp; stok
                    </div>
                  </div>
                )}
              </div>

              {/* Tanggal & Pihak Terkait */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Tanggal Transaksi</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={dmyToIsoDate(tanggalDmy)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setTanggalDmy(isoToDmyDate(e.target.value));
                        }
                      }}
                      className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <input
                      type="text"
                      value={tanggalDmy}
                      onChange={(e) => setTanggalDmy(e.target.value)}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                {(jenis === 'PEMBELIAN_HASIL_BUMI' ||
                  jenis === 'PENJUALAN_HASIL_BUMI' ||
                  jenis === 'PEMBELIAN_BARANG' ||
                  jenis === 'PENJUALAN' ||
                  jenis === 'KASBON_UANG') && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-zinc-700">
                        Mitra / Pihak Terkait
                      </label>
                      <div className="flex items-center gap-1 p-0.5 bg-zinc-100 rounded-md">
                        <button
                          type="button"
                          onClick={() => setModePihak('MITRA')}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                            modePihak === 'MITRA'
                              ? 'bg-white text-zinc-900 shadow-2xs'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Terdaftar
                        </button>
                        <button
                          type="button"
                          onClick={() => setModePihak('MANUAL')}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                            modePihak === 'MANUAL'
                              ? 'bg-white text-zinc-900 shadow-2xs'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Umum / Manual
                        </button>
                      </div>
                    </div>

                    {modePihak === 'MITRA' ? (
                      <select
                        value={idMitra}
                        onChange={(e) => {
                          setIdMitra(e.target.value);
                          const found = activeMitras.find((m) => m.id === e.target.value);
                          if (found) setNamaMitraManual(found.nama);
                        }}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      >
                        {activeMitras.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nama} ({m.role})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={namaMitraManual}
                        onChange={(e) => setNamaMitraManual(e.target.value)}
                        placeholder="Ketik nama petani / pembeli / pemasok..."
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    )}
                  </div>
                )}

                {(jenis === 'BAYAR_BON' || jenis === 'PENCAIRAN_TITIPAN') && (
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Mitra Terkait
                    </label>
                    <div className="px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-lg font-semibold text-zinc-800">
                      {record.namaMitra} <span className="font-mono text-zinc-500">({record.idMitra})</span>
                    </div>
                  </div>
                )}

                {(jenis === 'UPAH_HARIAN' || jenis === 'PENGGAJIAN') && (
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Karyawan
                    </label>
                    <div className="px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-lg font-semibold text-zinc-800">
                      {record.namaKaryawan}
                      {record.slipNomor ? (
                        <span className="font-mono text-zinc-500 ml-1">· {record.slipNomor}</span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* =================================================================
                  SECTION A: TIMBANGAN FISIK HASIL BUMI (PEMBELIAN & PENJUALAN)
              ================================================================= */}
              {((jenis === 'PEMBELIAN_HASIL_BUMI' && !isNonPhysicalHasilBumi) ||
                jenis === 'PENJUALAN_HASIL_BUMI') && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3.5">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                    <div className="flex items-center gap-2 font-bold text-zinc-900">
                      <Scale className="w-4 h-4 text-amber-700" />
                      <span>Koreksi Tonase Timbangan &amp; Harga Komoditas</span>
                    </div>
                    {selectedKomoditasObj && (
                      <span className="text-[11px] font-mono text-zinc-600">
                        Stok Gudang Saat Ini: <strong>{selectedKomoditasObj.stok.toLocaleString('id-ID')} Kg</strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Komoditas Hasil Bumi
                      </label>
                      <select
                        value={komoditasKode}
                        onChange={(e) => setKomoditasKode(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold bg-white"
                      >
                        {masters.stokHasilBumiList.map((k) => (
                          <option key={k.kode} value={k.kode}>
                            {k.nama} ({k.kode}) — Ready: {k.stok.toLocaleString('id-ID')} Kg
                          </option>
                        ))}
                      </select>
                    </div>

                    {jenis === 'PENJUALAN_HASIL_BUMI' ? (
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">
                          Nomor Surat Jalan / DO (Opsional)
                        </label>
                        <input
                          type="text"
                          value={noSuratJalan}
                          onChange={(e) => setNoSuratJalan(e.target.value)}
                          placeholder="Contoh: DO-WAP-001"
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono"
                        />
                      </div>
                    ) : (
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/70 w-full cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isBelumPutusHarga}
                            onChange={(e) => {
                              setIsBelumPutusHarga(e.target.checked);
                              if (e.target.checked) setMetode('TITIP');
                            }}
                            className="rounded border-amber-400 text-amber-700"
                          />
                          <span className="text-[11px] font-semibold text-amber-950">
                            Belum Putus Harga (Titip Timbang Mengambang)
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Berat Kotor / Bruto (Kg)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={beratKotorInput}
                        onChange={(e) => setBeratKotorInput(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-zinc-900"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Potongan Rafaksi (%)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="99.9"
                        disabled={useManualNetto}
                        value={rafaksiInput}
                        onChange={(e) => setRafaksiInput(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums disabled:bg-zinc-100 disabled:text-zinc-400"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-semibold text-zinc-700">
                          Berat Bersih (Kg)
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-zinc-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useManualNetto}
                            onChange={(e) => {
                              setUseManualNetto(e.target.checked);
                              if (e.target.checked) {
                                setBeratBersihManualInput(String(computedBeratBersih));
                              }
                            }}
                          />
                          <span>Isi Netto Manual</span>
                        </label>
                      </div>
                      {useManualNetto ? (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={beratBersihManualInput}
                          onChange={(e) => setBeratBersihManualInput(e.target.value)}
                          className="w-full px-3 py-2 border border-emerald-500 rounded-lg font-mono tabular-nums font-bold text-emerald-900 bg-emerald-50/40"
                        />
                      ) : (
                        <div className="px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-lg font-mono tabular-nums font-bold text-zinc-900">
                          {computedBeratBersih.toLocaleString('id-ID')} Kg
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        {jenis === 'PENJUALAN_HASIL_BUMI'
                          ? 'Harga Jual per Kg (Rp)'
                          : 'Harga Beli per Kg (Rp)'}
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={hargaPerKgInput}
                        onChange={(e) => setHargaPerKgInput(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-zinc-900"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Total Nilai Transaksi Otomatis
                      </label>
                      <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg font-mono tabular-nums font-bold text-emerald-900">
                        {formatRupiah(liveNominalBaru)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  SECTION B: MULTI-ITEM BARANG (PENJUALAN TOKO & KULAKAN BARANG)
              ================================================================= */}
              {(jenis === 'PENJUALAN' || jenis === 'PEMBELIAN_BARANG') && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3.5">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                    <div className="flex items-center gap-2 font-bold text-zinc-900">
                      <Package className="w-4 h-4 text-emerald-700" />
                      <span>
                        {isRekapNotaBarang
                          ? 'Koreksi Nominal Rekapan Nota Pembelian'
                          : 'Rincian Item, Qty & Harga Satuan'}
                      </span>
                    </div>
                    {!isRekapNotaBarang && (
                      <button
                        type="button"
                        onClick={handleAddLineItem}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Barang</span>
                      </button>
                    )}
                  </div>

                  {jenis === 'PEMBELIAN_BARANG' && (
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        No. Faktur / Nota Pemasok
                      </label>
                      <input
                        type="text"
                        value={noFakturSupplier}
                        onChange={(e) => setNoFakturSupplier(e.target.value)}
                        placeholder="Nomor faktur supplier..."
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono"
                      />
                    </div>
                  )}

                  {isRekapNotaBarang ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">
                          Deskripsi Rekapan Nota
                        </label>
                        <input
                          type="text"
                          value={lineItems[0]?.namaProduk || ''}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((it, idx) =>
                                idx === 0 ? { ...it, namaProduk: e.target.value } : it
                              )
                            )
                          }
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">
                          Total Nominal Rekapan (Rp)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={nominalInput}
                          onChange={(e) => setNominalInput(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lineItems.map((it, idx) => {
                        const rowSub =
                          Math.round((Number(it.qty) || 0) * (Number(it.hargaSatuan) || 0));
                        const stokRef = masters.stokBarangList.find(
                          (s) =>
                            String(s.kode || '').trim().toUpperCase() ===
                            String(it.kodeProduk || '').trim().toUpperCase()
                        );
                        return (
                          <div
                            key={`${it.kodeProduk}-${idx}`}
                            className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                          >
                            <div className="sm:col-span-5">
                              <label className="block text-[10px] font-semibold text-zinc-500 mb-1">
                                Produk ({stokRef ? `Stok Gudang: ${stokRef.stok} ${stokRef.satuan}` : it.satuan})
                              </label>
                              <select
                                value={it.kodeProduk}
                                onChange={(e) => handleProductRowChange(idx, e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg bg-white font-semibold text-xs"
                              >
                                {masters.produkList.map((p) => (
                                  <option key={p.kode} value={p.kode}>
                                    {p.nama} ({p.satuan})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-semibold text-zinc-500 mb-1">
                                Qty ({it.satuan})
                              </label>
                              <input
                                type="number"
                                step="any"
                                min="0.01"
                                value={it.qty}
                                onChange={(e) =>
                                  setLineItems((prev) =>
                                    prev.map((row, rIdx) =>
                                      rIdx === idx ? { ...row, qty: e.target.value } : row
                                    )
                                  )
                                }
                                className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg bg-white font-mono tabular-nums font-bold text-right"
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <label className="block text-[10px] font-semibold text-zinc-500 mb-1">
                                {jenis === 'PEMBELIAN_BARANG'
                                  ? 'Harga Modal / Satuan (Rp)'
                                  : 'Harga Jual / Satuan (Rp)'}
                              </label>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={it.hargaSatuan}
                                onChange={(e) =>
                                  setLineItems((prev) =>
                                    prev.map((row, rIdx) =>
                                      rIdx === idx ? { ...row, hargaSatuan: e.target.value } : row
                                    )
                                  )
                                }
                                className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg bg-white font-mono tabular-nums font-bold text-right"
                              />
                            </div>

                            <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
                              <div className="text-right min-w-0">
                                <span className="block text-[10px] text-zinc-400">Subtotal</span>
                                <span
                                  className="font-mono tabular-nums font-bold text-zinc-900 text-[11px] truncate block"
                                  title={formatRupiah(rowSub)}
                                >
                                  {formatRupiahSingkat(rowSub)}
                                </span>
                              </div>
                              {lineItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLineItem(idx)}
                                  className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  title="Hapus baris barang"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* =================================================================
                  SECTION C: UPAH HARIAN & PENGGAJIAN KARYAWAN
              ================================================================= */}
              {jenis === 'UPAH_HARIAN' && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Divisi Kerja</label>
                      <select
                        value={divisi}
                        onChange={(e) => setDivisi(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                      >
                        {allDivisiOptions.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Item Pekerjaan</label>
                      <input
                        type="text"
                        value={itemKerja}
                        onChange={(e) => setItemKerja(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Kuantiti / Hari</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={kuantitiUpahInput}
                        onChange={(e) => setKuantitiUpahInput(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Tarif Upah Satuan (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={hargaSatuanUpahInput}
                        onChange={(e) => setHargaSatuanUpahInput(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Uang Makan / Lembur (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={uangMakanLemburInput}
                        onChange={(e) => setUangMakanLemburInput(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Catatan Kerja</label>
                    <input
                      type="text"
                      value={catatanKerja}
                      onChange={(e) => setCatatanKerja(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {jenis === 'PENGGAJIAN' && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Divisi Pembayar</label>
                      <select
                        value={divisi}
                        onChange={(e) => setDivisi(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                      >
                        {allDivisiOptions.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Periode Bulan</label>
                      <input
                        type="text"
                        value={periodeBulan}
                        onChange={(e) => setPeriodeBulan(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Gaji Pokok (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={gajiPokokInput}
                        onChange={(e) => setGajiPokokInput(e.target.value)}
                        className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Tunjangan (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={tunjanganInput}
                        onChange={(e) => setTunjanganInput(e.target.value)}
                        className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Bonus (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={bonusInput}
                        onChange={(e) => setBonusInput(e.target.value)}
                        className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Potong Bon (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={potonganKasbonInput}
                        onChange={(e) => setPotonganKasbonInput(e.target.value)}
                        className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-rose-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Rekening Sumber Pencairan Gaji</label>
                    <select
                      value={rekeningSumber}
                      onChange={(e) => setRekeningSumber(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                    >
                      {activeRealAccounts.map((r) => (
                        <option key={r.kode} value={r.kode}>
                          {r.nama} ({r.kode}) — Saldo: {formatRupiah(r.saldoSaatIni)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* =================================================================
                  SECTION D: NOMINAL TUNGGAL (KASBON, BAYAR BON, TITIPAN, PENGELUARAN, TRANSFER, DANA MITRA)
              ================================================================= */}
              {(jenis === 'KASBON_UANG' ||
                jenis === 'BAYAR_BON' ||
                jenis === 'PENCAIRAN_TITIPAN' ||
                jenis === 'PENGELUARAN_DIVISI' ||
                jenis === 'TRANSFER_REKENING' ||
                isNonPhysicalHasilBumi) && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3.5">
                  {jenis === 'PENGELUARAN_DIVISI' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">Divisi</label>
                        <select
                          value={divisi}
                          onChange={(e) => setDivisi(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                        >
                          {allDivisiOptions.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">Kategori Biaya</label>
                        <input
                          type="text"
                          value={kategoriBiaya}
                          onChange={(e) => setKategoriBiaya(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">Oleh / Armada / Penerima</label>
                        <input
                          type="text"
                          value={penerima}
                          onChange={(e) => setPenerima(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                        />
                      </div>
                    </div>
                  )}

                  {jenis === 'TRANSFER_REKENING' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">Rekening Sumber (Keluar)</label>
                        <select
                          value={rekeningSumber}
                          onChange={(e) => setRekeningSumber(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                        >
                          {activeRealAccounts.map((r) => (
                            <option key={r.kode} value={r.kode}>
                              {r.nama} ({r.kode}) — {formatRupiah(r.saldoSaatIni)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">Rekening Tujuan (Masuk)</label>
                        <select
                          value={rekeningTujuan}
                          onChange={(e) => setRekeningTujuan(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                        >
                          {activeRealAccounts.map((r) => (
                            <option key={r.kode} value={r.kode}>
                              {r.nama} ({r.kode}) — {formatRupiah(r.saldoSaatIni)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Nominal Transaksi (Rp)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={nominalInput}
                      onChange={(e) => setNominalInput(e.target.value)}
                      className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg font-mono tabular-nums text-sm font-bold text-zinc-900"
                    />
                  </div>

                  {jenis === 'PENGELUARAN_DIVISI' && (
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Rekening Sumber Dana</label>
                      <select
                        value={rekeningSumber}
                        onChange={(e) => setRekeningSumber(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                      >
                        {activeRealAccounts.map((r) => (
                          <option key={r.kode} value={r.kode}>
                            {r.nama} ({r.kode}) — Saldo: {formatRupiah(r.saldoSaatIni)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {jenis === 'KASBON_UANG' && Boolean(record.isNotaLalu || record.rekeningSumber === 'BON01') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">Nomor Nota Fisik Lalu</label>
                        <input
                          type="text"
                          value={noNotaLalu}
                          onChange={(e) => setNoNotaLalu(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">Rincian Barang Nota Lalu</label>
                        <input
                          type="text"
                          value={rincianBarangNotaLalu}
                          onChange={(e) => setRincianBarangNotaLalu(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* =================================================================
                  SECTION E: METODE PEMBAYARAN & REKENING KAS/BANK
              ================================================================= */}
              {((jenis === 'PEMBELIAN_HASIL_BUMI' && !isNonPhysicalHasilBumi && !isBelumPutusHarga) ||
                jenis === 'PENJUALAN_HASIL_BUMI' ||
                jenis === 'PEMBELIAN_BARANG' ||
                jenis === 'PENJUALAN' ||
                (jenis === 'KASBON_UANG' && !record.isNotaLalu && record.rekeningSumber !== 'BON01') ||
                (jenis === 'BAYAR_BON' &&
                  record.metode !== 'SINKRON' &&
                  record.metode !== 'KOMPENSASI_TITIP' &&
                  record.metode !== 'POTONG_GAJI' &&
                  record.rekeningTujuan !== 'SINKRON' &&
                  !record.isKompensasiTitipan &&
                  !record.isPotongGaji) ||
                (jenis === 'PENCAIRAN_TITIPAN' &&
                  record.metodePembayaran !== 'SINKRON' &&
                  record.metodePembayaran !== 'KOMPENSASI_BON' &&
                  record.rekeningSumber !== 'SINKRON' &&
                  !record.isKompensasiBon)) && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
                  <div className="flex items-center gap-2 font-bold text-zinc-900">
                    <Wallet className="w-4 h-4 text-zinc-700" />
                    <span>Metode Pembayaran &amp; Rekening</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Metode</label>
                      <select
                        value={metode}
                        onChange={(e) => setMetode(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                      >
                        <option value="TUNAI">TUNAI (Kas Tunai KAS01)</option>
                        <option value="TRANSFER">TRANSFER BANK</option>
                        {jenis === 'PEMBELIAN_HASIL_BUMI' && (
                          <option value="TITIP">TITIP DANA PETANI (TIT01)</option>
                        )}
                        {jenis === 'PENJUALAN_HASIL_BUMI' && (
                          <option value="PIUTANG">PIUTANG DAGANG (BON01)</option>
                        )}
                        {jenis === 'PEMBELIAN_BARANG' && (
                          <option value="HUTANG">HUTANG SUPPLIER (TIT01)</option>
                        )}
                        {jenis === 'PENJUALAN' && (
                          <>
                            <option value="KASBON">KASBON MITRA (BON01)</option>
                            <option value="INTERNAL_PT">KEBUTUHAN INTERNAL PT (Rp 0)</option>
                          </>
                        )}
                      </select>
                    </div>

                    {metode === 'TRANSFER' && (
                      <div>
                        <label className="block font-semibold text-zinc-700 mb-1">
                          {jenis === 'PENJUALAN' ||
                          jenis === 'PENJUALAN_HASIL_BUMI' ||
                          jenis === 'BAYAR_BON'
                            ? 'Rekening Bank Tujuan Uang Riil (Masuk)'
                            : 'Rekening Bank Sumber Uang Riil (Keluar)'}
                        </label>
                        <select
                          value={
                            jenis === 'PENJUALAN' ||
                            jenis === 'PENJUALAN_HASIL_BUMI' ||
                            jenis === 'BAYAR_BON'
                              ? rekeningTujuan
                              : rekeningSumber
                          }
                          onChange={(e) => {
                            if (
                              jenis === 'PENJUALAN' ||
                              jenis === 'PENJUALAN_HASIL_BUMI' ||
                              jenis === 'BAYAR_BON'
                            ) {
                              setRekeningTujuan(e.target.value);
                            } else {
                              setRekeningSumber(e.target.value);
                            }
                          }}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                        >
                          {activeBankAccounts.map((b) => (
                            <option key={b.kode} value={b.kode}>
                              {b.nama} ({b.kode}) — {formatRupiah(b.saldoSaatIni)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {(jenis === 'PENJUALAN' ||
                    jenis === 'PENJUALAN_HASIL_BUMI' ||
                    jenis === 'PEMBELIAN_BARANG' ||
                    jenis === 'PEMBELIAN_HASIL_BUMI') && (
                    <div className="pt-2 border-t border-zinc-100">
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Divisi Usaha Terkait
                      </label>
                      <select
                        value={divisi}
                        onChange={(e) => setDivisi(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                      >
                        {allDivisiOptions.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {jenis === 'PEMBELIAN_HASIL_BUMI' && (isNonPhysicalHasilBumi || isBelumPutusHarga) && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-2">
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Divisi Usaha Terkait
                  </label>
                  <select
                    value={divisi}
                    onChange={(e) => setDivisi(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold"
                  >
                    {allDivisiOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Keterangan / Catatan */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Keterangan / Catatan Transaksi
                </label>
                <textarea
                  rows={2}
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Tambahkan catatan koreksi atau keterangan transaksi..."
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between gap-3">
              <span className="text-[11px] text-zinc-500">
                Perubahan otomatis memperbarui stok gudang, HPP riil, saldo kas/bank &amp; log audit.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={saving}
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
};
