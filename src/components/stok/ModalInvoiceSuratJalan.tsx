import React, { useState, useEffect, useMemo } from 'react';
import { X, Printer, CheckCircle2, FileText, Truck, AlertCircle } from 'lucide-react';
import { api } from '../../api/client.ts';
import { Mitra, Rekening, StokHasilBumi } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';

interface ModalInvoiceSuratJalanProps {
  open: boolean;
  onClose: () => void;
  stokHasilBumiList: StokHasilBumi[];
  rekeningList: Rekening[];
  onSuccess: () => void;
}

export const ModalInvoiceSuratJalan: React.FC<ModalInvoiceSuratJalanProps> = ({
  open,
  onClose,
  stokHasilBumiList,
  rekeningList,
  onSuccess,
}) => {
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [selectedMitraId, setSelectedMitraId] = useState<string>('');
  const [noInvoice, setNoInvoice] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `WAP${y}${m}${d}-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [tanggal, setTanggal] = useState<string>(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  });
  const [kategoriKode, setKategoriKode] = useState<string>('SKA');
  const [basis1, setBasis1] = useState<number>(61500);
  const [rendemen1, setRendemen1] = useState<number>(90.05);
  const [komoditasNama, setKomoditasNama] = useState<string>('KOPI');
  const [platTruk, setPlatTruk] = useState<string>('');
  const [tonaseAwalKg, setTonaseAwalKg] = useState<number>(0);
  const [tonaseAkhirKg, setTonaseAkhirKg] = useState<number>(0);
  const [hargaPerKgManual, setHargaPerKgManual] = useState<number | null>(null);

  // Potongan (-)
  const [pajakNominal, setPajakNominal] = useState<number>(0);
  const [komisiNominal, setKomisiNominal] = useState<number>(0);
  const [kasbonNominal, setKasbonNominal] = useState<number>(0);
  const [potonganLainLabel, setPotonganLainLabel] = useState<string>('');
  const [potonganLainNominal, setPotonganLainNominal] = useState<number>(0);

  // Tambahan (+)
  const [tambahanLabel, setTambahanLabel] = useState<string>('');
  const [tambahanNominal, setTambahanNominal] = useState<number>(0);

  // Rekening PT untuk Komisi & Pembayaran Supplier
  const [rekeningPtKode, setRekeningPtKode] = useState<string>('BNI01');
  const [prosesArusKas, setProsesArusKas] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [piutangMap, setPiutangMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.getMitra().catch(() => [] as Mitra[]),
      api.getRekapMitra().catch(() => null),
    ]).then(([mRes, rekapRes]) => {
      if (Array.isArray(mRes)) setMitraList(mRes);
      const map = new Map<string, number>();
      for (const it of rekapRes?.items || []) {
        const piutang = Math.max(
          0,
          Math.round(Number((it as any).saldoPiutang || (it as any).saldoAkhir || 0))
        );
        if (piutang > 0) map.set(it.id, piutang);
      }
      setPiutangMap(map);
    });
    const bni = rekeningList.find(
      (r) => r.kode === 'BNI01' || /bni\s*direct/i.test(r.nama || '')
    );
    if (bni) setRekeningPtKode(bni.kode);
  }, [open, rekeningList]);

  const selectedMitra = useMemo(
    () => mitraList.find((m) => m.id === selectedMitraId) || null,
    [mitraList, selectedMitraId]
  );

  // Otomatis tarik saldo piutang/kasbon aktif milik supplier saat dipilih
  useEffect(() => {
    if (selectedMitra) {
      setKasbonNominal(piutangMap.get(selectedMitra.id) || 0);
    } else {
      setKasbonNominal(0);
    }
  }, [selectedMitra, piutangMap]);

  const hargaPerKg = useMemo(() => {
    if (hargaPerKgManual !== null && hargaPerKgManual >= 0) return hargaPerKgManual;
    return Math.round(basis1 * (rendemen1 / 100) * 100) / 100;
  }, [basis1, rendemen1, hargaPerKgManual]);

  const totalPenjualan = useMemo(
    () => Math.round(tonaseAkhirKg * hargaPerKg),
    [tonaseAkhirKg, hargaPerKg]
  );

  const totalPotongan = useMemo(
    () =>
      Math.round(
        (Number(pajakNominal) || 0) +
          (Number(komisiNominal) || 0) +
          (Number(kasbonNominal) || 0) +
          (Number(potonganLainNominal) || 0)
      ),
    [pajakNominal, komisiNominal, kasbonNominal, potonganLainNominal]
  );

  const totalTambahan = useMemo(
    () => Math.round(Number(tambahanNominal) || 0),
    [tambahanNominal]
  );

  const jumlahPembayaran = useMemo(
    () => Math.max(0, totalPenjualan - totalPotongan + totalTambahan),
    [totalPenjualan, totalPotongan, totalTambahan]
  );

  const susutKg = useMemo(() => {
    if (tonaseAwalKg > 0 && tonaseAkhirKg > 0) {
      return Math.round((tonaseAwalKg - tonaseAkhirKg) * 10) / 10;
    }
    return 0;
  }, [tonaseAwalKg, tonaseAkhirKg]);

  const handlePrintInvoice = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const namaSupplier = selectedMitra?.nama || 'SUPPLIER';
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${noInvoice} - ${namaSupplier}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          .header { display: flex; justify-content: space-between; background: #0f628b; color: #fff; padding: 16px 20px; }
          .header h1 { margin: 0; font-size: 20px; }
          .header p { margin: 2px 0; font-size: 12px; }
          .sub-header { display: flex; justify-content: space-between; background: #d9e6ee; padding: 12px 20px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
          th, td { border: 1px solid #99b8c9; padding: 6px 10px; }
          th { background: #0f628b; color: #fff; text-align: left; }
          .right { text-align: right; }
          .center { text-align: center; }
          .total-row { background: #0f628b; color: #fff; font-weight: bold; }
          .grand-total { background: #0f628b; color: #fff; font-size: 16px; font-weight: bold; }
          .footer { display: flex; justify-content: space-between; margin-top: 28px; font-size: 13px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>PT WIJAYA AGRO PERKASA</h1>
            <p>Jl Kalangan Desa Simpang Luas, Kec. Sungai Are, Kab. OKU Selatan</p>
            <p>Sumatera Selatan · 082144999305</p>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:bold;">INVOICE</div>
            <div>${noInvoice}</div>
            <div>${tanggal}</div>
          </div>
        </div>
        <div class="sub-header">
          <div>
            <div style="font-size:18px;">${kategoriKode}</div>
            <div>BASIS 1 : Rp ${basis1.toLocaleString('id-ID')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:16px;">${namaSupplier}</div>
            <div>RENDEMEN 1 : ${rendemen1.toFixed(2)}%</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="center" style="width:40px">NO</th>
              <th>DESKRIPSI</th>
              <th>TRUK</th>
              <th class="right">KUANTITI (Kg)</th>
              <th class="right">HARGA (Rp)</th>
              <th class="right">JUMLAH (Rp)</th>
              <th>KET</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="center">1</td>
              <td>${komoditasNama}</td>
              <td>${platTruk || '-'}</td>
              <td class="right">${tonaseAkhirKg.toLocaleString('id-ID')}</td>
              <td class="right">Rp ${hargaPerKg.toLocaleString('id-ID')}</td>
              <td class="right">Rp ${totalPenjualan.toLocaleString('id-ID')}</td>
              <td>${susutKg !== 0 ? `Susut ${susutKg} Kg` : ''}</td>
            </tr>
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL PENJUALAN :</td>
              <td class="right">Rp ${totalPenjualan.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">1</td>
              <td colspan="4">PAJAK</td>
              <td class="right">Rp ${pajakNominal.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">2</td>
              <td colspan="4">KOMISI</td>
              <td class="right">Rp ${komisiNominal.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">3</td>
              <td colspan="4"><strong>KASBON</strong></td>
              <td class="right"><strong>Rp ${kasbonNominal.toLocaleString('id-ID')}</strong></td>
              <td></td>
            </tr>
            ${
              potonganLainNominal > 0
                ? `<tr><td class="center">4</td><td colspan="4">${potonganLainLabel || 'POTONGAN LAIN'}</td><td class="right">Rp ${potonganLainNominal.toLocaleString('id-ID')}</td><td></td></tr>`
                : ''
            }
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL POTONGAN (-) :</td>
              <td class="right">Rp ${totalPotongan.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            ${
              tambahanNominal > 0
                ? `<tr><td class="center">1</td><td colspan="4">${tambahanLabel || 'TAMBAHAN'}</td><td class="right">Rp ${tambahanNominal.toLocaleString('id-ID')}</td><td></td></tr>`
                : ''
            }
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL TAMBAHAN (+) :</td>
              <td class="right">Rp ${totalTambahan.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr class="grand-total">
              <td colspan="5" class="right">Jumlah Pembayaran :</td>
              <td class="right">Rp ${jumlahPembayaran.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          <div>
            <strong>Catatan :</strong><br/>
            Pembayaran Via Transfer
          </div>
          <div style="text-align:right">
            Hormat Kami<br/>
            PT Wijaya Agro Perkasa<br/><br/><br/>
            <strong>Fahlevi Martawijaya</strong>
          </div>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const handleSimpanInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMitra) {
      setErrorMsg('Pilih Supplier / Mitra terlebih dahulu.');
      return;
    }
    if (tonaseAkhirKg <= 0 || totalPenjualan <= 0) {
      setErrorMsg('Tonase akhir dan total penjualan harus lebih dari 0.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (prosesArusKas) {
        // 1. Catat Komisi PT masuk ke rekening PT (misal BNI DIRECT)
        if (komisiNominal > 0) {
          await api.processUangMasuk({
            tanggal,
            divisi: 'PT Wijaya Agro Perkasa',
            kategori: 'KOMISI_SURAT_JALAN',
            metode: 'TRANSFER',
            nominal: komisiNominal,
            rekeningTujuan: rekeningPtKode,
            namaPengirimManual: selectedMitra.nama,
            keterangan: `Komisi Invoice Surat Jalan ${noInvoice} (${selectedMitra.nama} · ${komoditasNama} ${tonaseAkhirKg} Kg)`,
          });
        }

        // 2. Potong Kasbon / Piutang Supplier otomatis jika ada
        if (kasbonNominal > 0) {
          await api.processUangMasuk({
            tanggal,
            divisi: 'PT Wijaya Agro Perkasa',
            kategori: 'PELUNASAN_BON',
            metode: 'TRANSFER',
            idMitra: selectedMitra.id,
            nominal: kasbonNominal,
            rekeningTujuan: rekeningPtKode,
            keterangan: `Potong Kasbon dari Invoice ${noInvoice} (${selectedMitra.nama})`,
          });
        }

        // 3. Catat Pembayaran Hak Supplier dari rekening PT
        if (jumlahPembayaran > 0) {
          await api.createPengeluaran({
            tanggal,
            divisi: 'PT Wijaya Agro Perkasa',
            kategori: 'PEMBAYARAN_SUPPLIER_SJ',
            nominal: jumlahPembayaran,
            rekeningSumber: rekeningPtKode,
            keterangan: `Pembayaran Hak Supplier Invoice ${noInvoice} a.n. ${selectedMitra.nama} (${komoditasNama} ${tonaseAkhirKg} Kg)`,
          });
        }
      }

      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan & memproses arus kas invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl w-full max-w-3xl overflow-hidden my-8">
        <div className="px-5 py-4 bg-sky-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-sky-200" />
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                Invoice Surat Jalan Penjualan (Titip Jual Supplier)
              </h3>
              <p className="text-[11px] text-sky-200">
                Hitung Basis, Rendemen, Susut Truk, Potong Kasbon Otomatis &amp; Komisi PT
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-sky-800 text-sky-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSimpanInvoice} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Baris 1: Supplier, No Invoice, Tanggal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Supplier / Mitra *
              </label>
              <select
                value={selectedMitraId}
                onChange={(e) => setSelectedMitraId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-semibold"
                required
              >
                <option value="">-- Pilih Supplier --</option>
                {mitraList.map((m) => {
                  const bon = piutangMap.get(m.id) || 0;
                  return (
                    <option key={m.id} value={m.id}>
                      {m.nama} {bon > 0 ? `(Bon: ${formatRupiah(bon)})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">No. Invoice</label>
              <input
                type="text"
                value={noInvoice}
                onChange={(e) => setNoInvoice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Tanggal</label>
              <input
                type="text"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
              />
            </div>
          </div>

          {/* Baris 2: Komoditas, Plat Truk, Basis, Rendemen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-sky-50/60 p-3 rounded-xl border border-sky-200">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Komoditas</label>
              <select
                value={komoditasNama}
                onChange={(e) => setKomoditasNama(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs bg-white"
              >
                <option value="KOPI">KOPI</option>
                {stokHasilBumiList.map((hb) => (
                  <option key={hb.kode} value={hb.nama}>
                    {hb.nama}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Plat Truk</label>
              <input
                type="text"
                placeholder="BE 8206 AMN"
                value={platTruk}
                onChange={(e) => setPlatTruk(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Basis 1 (Rp)</label>
              <input
                type="number"
                value={basis1}
                onChange={(e) => {
                  setBasis1(Number(e.target.value) || 0);
                  setHargaPerKgManual(null);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Rendemen 1 (%)</label>
              <input
                type="number"
                step="0.01"
                value={rendemen1}
                onChange={(e) => {
                  setRendemen1(Number(e.target.value) || 0);
                  setHargaPerKgManual(null);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono bg-white"
              />
            </div>
          </div>

          {/* Baris 3: Tonase Awal (Sewa Truk) vs Tonase Akhir (Invoice) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Tonase Awal Berangkat (Kg)
              </label>
              <input
                type="number"
                value={tonaseAwalKg || ''}
                onChange={(e) => setTonaseAwalKg(Number(e.target.value) || 0)}
                placeholder="Acuan Sewa Truk (misal 1423)"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Tonase Akhir Invoice (Kg) *
              </label>
              <input
                type="number"
                value={tonaseAkhirKg || ''}
                onChange={(e) => setTonaseAkhirKg(Number(e.target.value) || 0)}
                placeholder="Tonase Pabrik (misal 1416)"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Harga / Kg (Rp)
              </label>
              <input
                type="number"
                step="0.01"
                value={hargaPerKg}
                onChange={(e) => setHargaPerKgManual(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
              />
              {susutKg !== 0 && (
                <div className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" />
                  <span>Susut perjalanan: {susutKg} Kg</span>
                </div>
              )}
            </div>
          </div>

          {/* Total Penjualan */}
          <div className="bg-sky-900 text-white px-4 py-2.5 rounded-xl flex items-center justify-between">
            <span className="text-xs font-bold">TOTAL PENJUALAN ({tonaseAkhirKg} Kg × Rp {hargaPerKg.toLocaleString('id-ID')})</span>
            <span className="font-mono text-base font-extrabold">{formatRupiah(totalPenjualan)}</span>
          </div>

          {/* Potongan (-) */}
          <div className="border border-zinc-200 rounded-xl p-3.5 space-y-3">
            <div className="text-xs font-bold text-zinc-800">Potongan (-)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">1. Pajak (Rp)</label>
                <input
                  type="number"
                  value={pajakNominal || ''}
                  onChange={(e) => setPajakNominal(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-emerald-700 mb-1">
                  2. Komisi PT (Rp) → Masuk Rekening PT
                </label>
                <input
                  type="number"
                  value={komisiNominal || ''}
                  onChange={(e) => setKomisiNominal(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 text-xs font-mono font-bold text-emerald-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-amber-800 mb-1">
                  3. Potong Kasbon / Piutang (Rp)
                </label>
                <input
                  type="number"
                  value={kasbonNominal || ''}
                  onChange={(e) => setKasbonNominal(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg border border-amber-300 text-xs font-mono font-bold text-amber-900"
                />
              </div>
            </div>
          </div>

          {/* Jumlah Pembayaran ke Supplier */}
          <div className="bg-emerald-900 text-white px-4 py-3 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-200">Jumlah Pembayaran Hak Supplier</div>
              <div className="text-[11px] text-emerald-300">
                Total Penjualan - Total Potongan ({formatRupiah(totalPotongan)}) + Tambahan
              </div>
            </div>
            <div className="font-mono text-xl font-extrabold">{formatRupiah(jumlahPembayaran)}</div>
          </div>

          {/* Opsi Arus Kas */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={prosesArusKas}
                onChange={(e) => setProsesArusKas(e.target.checked)}
                className="rounded border-zinc-300"
              />
              <span>Otomatis catat Komisi, Potong Kasbon &amp; Pembayaran Supplier ke Arus Kas</span>
            </label>
            {prosesArusKas && (
              <select
                value={rekeningPtKode}
                onChange={(e) => setRekeningPtKode(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-semibold bg-white"
              >
                {rekeningList
                  .filter((r) => !r.isVirtual && r.status === 'AKTIF')
                  .map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.kode} - {r.nama}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
            <button
              type="button"
              onClick={handlePrintInvoice}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-sky-700 text-sky-800 hover:bg-sky-50 text-xs font-bold cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF Invoice</span>
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan & Proses Pembayaran'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
