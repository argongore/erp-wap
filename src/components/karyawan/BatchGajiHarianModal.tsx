import React, { useState } from 'react';
import {
  X,
  Calendar,
  Building2,
  DollarSign,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Users,
  Sparkles,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import { DAFTAR_DIVISI, NamaDivisi, Rekening, TransaksiPenggajian } from '../../server/types.ts';

interface BatchRowItem {
  idKaryawan: string;
  divisi: NamaDivisi;
  gajiNominal: number;
  bonus: number;
  persentasePotongKasbon: number;
  keterangan: string;
}

interface BatchGajiHarianModalProps {
  karyawanList: KaryawanWithBon[];
  rekeningList: Rekening[];
  onClose: () => void;
  onSuccess: (slips: TransaksiPenggajian[]) => void;
}

export const BatchGajiHarianModal: React.FC<BatchGajiHarianModalProps> = ({
  karyawanList,
  rekeningList,
  onClose,
  onSuccess,
}) => {
  const activeKaryawan = karyawanList.filter((k) => k.status === 'AKTIF');
  const todayStr = new Date().toISOString().split('T')[0];

  const [tanggalKerja, setTanggalKerja] = useState<string>(todayStr);

  // Initialize rows with active employees
  const [rows, setRows] = useState<BatchRowItem[]>(() => {
    return activeKaryawan.slice(0, 5).map((k, index) => {
      // Rotate initial divisions for variety
      const divList: NamaDivisi[] = [
        'Gudang Wijaya Agro',
        'Wijaya Karya',
        'Wijaya Transport',
        'CV Wijaya Agro',
        'PT Wijaya Agro Perkasa',
        'Okussa',
      ];
      const div = divList[index % divList.length];
      const estHarian = k.gajiPokok ? Math.round(k.gajiPokok / 25) : 120000;
      return {
        idKaryawan: k.id,
        divisi: div,
        gajiNominal: estHarian,
        bonus: 0,
        persentasePotongKasbon: 0, // default 0 for daily, can be changed
        keterangan: '',
      };
    });
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const formatRupiah = (val: number) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const handleAddRow = () => {
    // Pick an employee not yet in rows if possible
    const usedIds = new Set(rows.map((r) => r.idKaryawan));
    const available = activeKaryawan.find((k) => !usedIds.has(k.id)) || activeKaryawan[0];
    if (!available) return;

    const estHarian = available.gajiPokok ? Math.round(available.gajiPokok / 25) : 120000;
    setRows([
      ...rows,
      {
        idKaryawan: available.id,
        divisi: 'Gudang Wijaya Agro',
        gajiNominal: estHarian,
        bonus: 0,
        persentasePotongKasbon: 0,
        keterangan: '',
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleUpdateRow = (index: number, updates: Partial<BatchRowItem>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...updates };
    setRows(next);
  };

  const handleSetQuickRate = (nominal: number) => {
    setRows(rows.map((r) => ({ ...r, gajiNominal: nominal })));
  };

  // Grand totals
  const totalUpahKotor = rows.reduce(
    (sum, r) => sum + (Number(r.gajiNominal) || 0) + (Number(r.bonus) || 0),
    0
  );

  const calculateRowBersih = (r: BatchRowItem) => {
    const kry = activeKaryawan.find((k) => k.id === r.idKaryawan);
    const totalBon = kry?.totalKasbonAktif || 0;
    const kotor = (Number(r.gajiNominal) || 0) + (Number(r.bonus) || 0);
    let potong = 0;
    if (r.persentasePotongKasbon > 0 && totalBon > 0) {
      potong = Math.min(Math.round((totalBon * r.persentasePotongKasbon) / 100), totalBon, kotor);
    }
    return { kotor, potong, bersih: Math.max(0, kotor - potong), totalBon };
  };

  const totalUpahBersih = rows.reduce((sum, r) => sum + calculateRowBersih(r).bersih, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (rows.length === 0) {
      setErrorMsg('Minimal satu karyawan harus diinput.');
      return;
    }

    // Convert date YYYY-MM-DD to DD/MM/YYYY
    const [y, m, d] = tanggalKerja.split('-');
    const formattedTanggal = `${d}/${m}/${y}`;

    setSubmitting(true);
    try {
      const payloadItems = rows.map((r) => {
        return {
          idKaryawan: r.idKaryawan,
          divisi: r.divisi,
          gajiNominal: Number(r.gajiNominal) || 0,
          bonus: Number(r.bonus) || 0,
          persentasePotongKasbon: Number(r.persentasePotongKasbon) || 0,
          keterangan: r.keterangan || `Upah Harian [${r.divisi}] (${formattedTanggal})`,
        };
      });

      const res = await api.processBatchPenggajianHarian({
        tanggalKerja: formattedTanggal,
        items: payloadItems,
      });

      onSuccess(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses batch penggajian');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-amber-950 border border-amber-700 text-amber-400 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-zinc-100 flex items-center space-x-2">
                <span>Input Cepat Upah Harian Kolektif (Batch Karyawan)</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-800">
                  {rows.length} Karyawan
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Tugaskan masing-masing karyawan ke divisinya hari ini, masukkan nominal upah manual, dan proses serentak
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-700 text-rose-300 rounded-lg flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Top Bar: Tanggal Kerja & Quick Rate Presets */}
          <div className="bg-zinc-950/80 p-3.5 rounded-lg border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <label className="font-bold text-zinc-200">Tanggal Kerja Hari Ini:</label>
              <input
                type="date"
                value={tanggalKerja}
                onChange={(e) => setTanggalKerja(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                required
              />
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-zinc-400">Set Cepat Upah Rata-rata:</span>
              {[120000, 135000, 150000, 175000].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleSetQuickRate(rate)}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-200 font-mono"
                >
                  {formatRupiah(rate)}
                </button>
              ))}
            </div>
          </div>

          {/* Table of Rows */}
          <div className="border border-zinc-800 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Karyawan</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Divisi Tugas Hari Ini</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Hari Ini Kerja Untuk Apa</th>
                  <th className="py-2.5 px-3 min-w-[120px]">Upah (Manual)</th>
                  <th className="py-2.5 px-3 min-w-[90px]">Lembur</th>
                  <th className="py-2.5 px-3 min-w-[110px]">Potong Bon</th>
                  <th className="py-2.5 px-3 min-w-[120px] text-right">Bersih Dibayar</th>
                  <th className="py-2.5 px-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {rows.map((row, idx) => {
                  const kry = activeKaryawan.find((k) => k.id === row.idKaryawan);
                  const calc = calculateRowBersih(row);

                  return (
                    <tr key={idx} className="hover:bg-zinc-800/30">
                      <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">{idx + 1}</td>

                      {/* Employee Select */}
                      <td className="py-2.5 px-3">
                        <select
                          value={row.idKaryawan}
                          onChange={(e) => {
                            const newKry = activeKaryawan.find((k) => k.id === e.target.value);
                            const estHarian = newKry?.gajiPokok ? Math.round(newKry.gajiPokok / 25) : 120000;
                            handleUpdateRow(idx, {
                              idKaryawan: e.target.value,
                              gajiNominal: estHarian,
                            });
                          }}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 font-semibold focus:outline-hidden focus:border-emerald-500 text-xs"
                        >
                          {activeKaryawan.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.nama} ({k.nik})
                            </option>
                          ))}
                        </select>
                        {calc.totalBon > 0 && (
                          <span className="block text-[10px] text-rose-400 mt-0.5 font-mono">
                            Ada Bon: {formatRupiah(calc.totalBon)}
                          </span>
                        )}
                      </td>

                      {/* Divisi Select */}
                      <td className="py-2.5 px-3">
                        <select
                          value={row.divisi}
                          onChange={(e) =>
                            handleUpdateRow(idx, { divisi: e.target.value as NamaDivisi })
                          }
                          className="w-full bg-zinc-800 border border-amber-700/60 rounded px-2 py-1.5 text-amber-300 font-bold focus:outline-hidden focus:border-amber-400 text-xs"
                        >
                          {DAFTAR_DIVISI.map((d) => (
                            <option key={d.id} value={d.nama}>
                              {d.nama}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Tugas / Hari Ini Kerja Untuk Apa */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.keterangan || ''}
                          onChange={(e) =>
                            handleUpdateRow(idx, { keterangan: e.target.value })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 focus:outline-hidden focus:border-amber-400 text-xs"
                          placeholder="e.g. Sortasi gabah / Dryer"
                        />
                      </td>

                      {/* Upah Manual */}
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.gajiNominal || ''}
                          onChange={(e) =>
                            handleUpdateRow(idx, {
                              gajiNominal: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-emerald-500 text-xs text-right"
                          placeholder="Nominal"
                          required
                        />
                      </td>

                      {/* Lembur */}
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.bonus || ''}
                          onChange={(e) =>
                            handleUpdateRow(idx, {
                              bonus: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500 text-xs text-right"
                          placeholder="0"
                        />
                      </td>

                      {/* Potong Bon % */}
                      <td className="py-2.5 px-3">
                        {calc.totalBon > 0 ? (
                          <select
                            value={row.persentasePotongKasbon}
                            onChange={(e) =>
                              handleUpdateRow(idx, {
                                persentasePotongKasbon: Number(e.target.value),
                              })
                            }
                            className="w-full bg-zinc-800 border border-rose-800/80 rounded px-1.5 py-1.5 text-rose-300 font-semibold focus:outline-hidden text-[11px]"
                          >
                            <option value={0}>0% (Lewati)</option>
                            <option value={25}>25%</option>
                            <option value={50}>50%</option>
                            <option value={100}>100% (Lunas)</option>
                          </select>
                        ) : (
                          <span className="text-[10px] text-zinc-500 italic block py-1.5">
                            Bebas Bon
                          </span>
                        )}
                      </td>

                      {/* Bersih Dibayar */}
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono font-bold text-emerald-400 text-xs block">
                          {formatRupiah(calc.bersih)}
                        </span>
                        {calc.potong > 0 && (
                          <span className="font-mono text-[10px] text-rose-400 block">
                            Potong: -{formatRupiah(calc.potong)}
                          </span>
                        )}
                      </td>

                      {/* Hapus Baris */}
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          disabled={rows.length <= 1}
                          className="text-zinc-500 hover:text-rose-400 disabled:opacity-30 p-1 rounded"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Row Button */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Pekerja Hari Ini</span>
            </button>

            <span className="text-zinc-400 text-xs">
              Masing-masing upah otomatis dibebankan ke Rekening Kas Divisi yang dipilih
            </span>
          </div>

          {/* Summary Total Banner */}
          <div className="bg-emerald-950 border border-emerald-600/80 p-4 rounded-xl flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400 block">
                TOTAL UPAH BERSIH {rows.length} KARYAWAN HARI INI
              </span>
              <p className="text-[11px] text-zinc-300 mt-0.5">
                Kotor {formatRupiah(totalUpahKotor)} • Tanggal:{' '}
                {tanggalKerja.split('-').reverse().join('/')}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono text-emerald-300 tracking-tight block">
                {formatRupiah(totalUpahBersih)}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">
                Semua slip upah akan diterbitkan otomatis
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium text-xs transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || rows.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-md transition-colors flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Memproses Seluruh Upah...'
                  : `Simpan & Bayar ${rows.length} Upah Karyawan`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
