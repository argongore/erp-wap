import React from 'react';
import { AlertTriangle, CheckCircle2, ListChecks, ShieldCheck } from 'lucide-react';
import { RekeningKoranHistoryItem } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';

export type CaraAlokasiKliring = 'PILIH_STAY' | 'PILIH_NOTA' | 'OTOMATIS_FIFO';

export interface SelectableOpenBonSubItem {
  nama: string;
  qty: number;
  satuan: string;
  subtotal: number;
}

export interface SelectableOpenBonNote {
  /** ID unik per baris transaksi/item (mis. NSL2611166405-IT1, NSL2611166405-IT2, KBU2611243531) */
  refId: string;
  /** ID nota induk (mis. NSL2611166405) untuk tampilan informasi */
  parentRefId: string;
  tanggal: string;
  jenis: string;
  ringkasan: string;
  subItems: SelectableOpenBonSubItem[];
  sisa: number;
  isNotaNgunci?: boolean;
  jumlahItem: number;
}

/**
 * Mengambil SETIAP baris transaksi / item piutang yang masih terbuka dari Rekening Koran Mitra
 * secara individual (1 baris transaksi = 1 checkbox) agar kasir bebas mencentang per transaksi/item.
 */
export function extractOpenBonNotesFromRekeningKoran(
  history: RekeningKoranHistoryItem[] = []
): SelectableOpenBonNote[] {
  const rows: SelectableOpenBonNote[] = [];

  for (const h of history) {
    const sisaRow = Math.max(0, Math.round(Number(h.sisaPiutangNota) || 0));
    if (sisaRow <= 0) continue;
    const rowId = String(h.id || '').trim();
    if (!rowId) continue;
    const parentRefId = String(h.idTransaksiInduk || h.id || '').trim();

    const details = h.itemsDetail || [];
    const subItems: SelectableOpenBonSubItem[] = details.map((it) => ({
      nama: it.nama,
      qty: Number(it.qty) || 0,
      satuan: it.satuan || '',
      subtotal: Math.round(
        Number(it.subtotal) || Number(it.harga) * (Number(it.qty) || 1) || 0
      ),
    }));

    const ringkasan =
      details.length === 1
        ? `${details[0].nama}${details[0].qty > 0 ? ` (${details[0].qty} ${details[0].satuan})` : ''}${
            h.catatanTransaksi &&
            !details[0].nama.toLowerCase().includes(h.catatanTransaksi.toLowerCase()) &&
            !h.idTransaksiInduk
              ? ` · ${h.catatanTransaksi}`
              : ''
          }`
        : details.length > 1
          ? details
              .map((it) => `${it.nama}${it.qty > 0 ? ` (${it.qty} ${it.satuan})` : ''}`)
              .join(', ')
          : h.catatanTransaksi || h.keterangan || h.jenis;

    rows.push({
      refId: rowId,
      parentRefId,
      tanggal: h.tanggal || '-',
      jenis: h.jenis || 'PIUTANG',
      ringkasan,
      subItems,
      sisa: sisaRow,
      isNotaNgunci: Boolean(h.isNotaNgunci),
      jumlahItem: Math.max(1, details.length),
    });
  }

  return rows;
}

/**
 * Biarkan default kosong agar kasir bebas mencentang transaksi satu per satu sesuai keinginan.
 */
export function findSuggestedStayBonIds(
  _notes: SelectableOpenBonNote[],
  _targetSisaStay: number
): string[] {
  return [];
}

interface KliringBonChecklistPanelProps {
  openBonNotes: SelectableOpenBonNote[];
  loadingOpenNotes: boolean;
  caraAlokasi: CaraAlokasiKliring;
  onChangeCaraAlokasi: (nextMode: CaraAlokasiKliring) => void;
  stayBonIds: string[];
  onChangeStayBonIds: (nextIds: string[]) => void;
  selectedTargetBonIds: string[];
  onChangeSelectedTargetBonIds: (nextIds: string[], suggestedNominalPotong: number) => void;
  totalPiutang: number;
  nominalPotong: number;
  maxPotongSilang: number;
  compact?: boolean;
}

export const KliringBonChecklistPanel: React.FC<KliringBonChecklistPanelProps> = ({
  openBonNotes,
  loadingOpenNotes,
  caraAlokasi,
  onChangeCaraAlokasi,
  stayBonIds,
  onChangeStayBonIds,
  selectedTargetBonIds,
  onChangeSelectedTargetBonIds,
  totalPiutang,
  nominalPotong,
  maxPotongSilang,
  compact = false,
}) => {
  if (!loadingOpenNotes && openBonNotes.length === 0) return null;

  const sisaPiutangSetelahPotong = Math.max(0, totalPiutang - nominalPotong);

  const totalStaySisa = openBonNotes
    .filter((n) => stayBonIds.includes(n.refId))
    .reduce((sum, n) => sum + n.sisa, 0);

  const totalTargetLunasSisa = openBonNotes
    .filter((n) => selectedTargetBonIds.includes(n.refId))
    .reduce((sum, n) => sum + n.sisa, 0);

  const stayExactMatch =
    stayBonIds.length > 0 &&
    sisaPiutangSetelahPotong > 0 &&
    totalStaySisa === sisaPiutangSetelahPotong;
  const stayOverLimit = totalStaySisa > sisaPiutangSetelahPotong;
  const staySelisih = sisaPiutangSetelahPotong - totalStaySisa;

  const toggleStayNote = (refId: string) => {
    const next = stayBonIds.includes(refId)
      ? stayBonIds.filter((id) => id !== refId)
      : [...stayBonIds, refId];
    onChangeStayBonIds(next);
  };

  const toggleTargetNote = (refId: string) => {
    const next = selectedTargetBonIds.includes(refId)
      ? selectedTargetBonIds.filter((id) => id !== refId)
      : [...selectedTargetBonIds, refId];
    const nextTotal = openBonNotes
      .filter((n) => next.includes(n.refId))
      .reduce((s, n) => s + n.sisa, 0);
    onChangeSelectedTargetBonIds(next, Math.min(nextTotal, maxPotongSilang));
  };

  const notesYangDilunasiPadaModeStay = openBonNotes.filter((n) => !stayBonIds.includes(n.refId));
  const notesYangStayPadaModePilihLunas = openBonNotes.filter(
    (n) => !selectedTargetBonIds.includes(n.refId)
  );

  return (
    <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold text-amber-950 flex items-center gap-1.5">
          <ListChecks className="w-4 h-4 text-amber-700 shrink-0" />
          <span>Checklist Per Transaksi ({openBonNotes.length} Item Aktif)</span>
        </div>
        <div className="inline-flex flex-wrap rounded-lg border border-amber-300 bg-white p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => onChangeCaraAlokasi('PILIH_STAY')}
            className={`px-2 py-1 rounded-md font-bold cursor-pointer transition-colors ${
              caraAlokasi === 'PILIH_STAY'
                ? 'bg-rose-700 text-white'
                : 'text-rose-900 hover:bg-rose-50'
            }`}
          >
            Pilih Bon Stay
          </button>
          <button
            type="button"
            onClick={() => onChangeCaraAlokasi('PILIH_NOTA')}
            className={`px-2 py-1 rounded-md font-bold cursor-pointer transition-colors ${
              caraAlokasi === 'PILIH_NOTA'
                ? 'bg-amber-700 text-white'
                : 'text-amber-950 hover:bg-amber-50'
            }`}
          >
            Pilih Bon Dilunasi
          </button>
          <button
            type="button"
            onClick={() => onChangeCaraAlokasi('OTOMATIS_FIFO')}
            className={`px-2 py-1 rounded-md font-bold cursor-pointer transition-colors ${
              caraAlokasi === 'OTOMATIS_FIFO'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            Urut Terlama (FIFO)
          </button>
        </div>
      </div>

      {caraAlokasi === 'PILIH_STAY' && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-amber-950 leading-snug">
              Centang <strong>satu per satu transaksi/item yang MASIH STAY (belum dibayar)</strong>. Transaksi yang{' '}
              <strong>tidak dicentang</strong> otomatis dilunasi dan pindah bersih ke <em>History Transaksi</em>.
            </p>
            {stayBonIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeStayBonIds([])}
                className="px-2 py-0.5 rounded border border-zinc-300 bg-white hover:bg-zinc-100 text-[10px] font-semibold text-zinc-600 shrink-0 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* Indikator Target Sisa Piutang vs Jumlah Checklist Stay */}
          <div
            className={`p-2.5 rounded-lg border space-y-1.5 ${
              stayOverLimit
                ? 'bg-rose-50 border-rose-300'
                : stayExactMatch
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-white border-amber-300'
            }`}
          >
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="text-zinc-500">Sisa Piutang Setelah Kliring</div>
                <div className="font-mono tabular-nums font-black text-zinc-900 text-xs">
                  {formatRupiah(sisaPiutangSetelahPotong)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-zinc-500">Total Dicentang Stay ({stayBonIds.length})</div>
                <div
                  className={`font-mono tabular-nums font-black text-xs ${
                    stayOverLimit
                      ? 'text-rose-700'
                      : stayExactMatch
                        ? 'text-emerald-800'
                        : 'text-amber-900'
                  }`}
                >
                  {formatRupiah(totalStaySisa)}
                </div>
              </div>
            </div>

            {sisaPiutangSetelahPotong === 0 ? (
              <div className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1.5 pt-1 border-t border-zinc-200/70">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Nominal potong melunasi 100% seluruh piutang mitra (Sisa Rp 0).</span>
              </div>
            ) : stayExactMatch ? (
              <div className="text-[11px] text-emerald-900 font-semibold flex items-start gap-1.5 pt-1 border-t border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  PAS {formatRupiah(sisaPiutangSetelahPotong)}! {stayBonIds.length} transaksi dicentang tetap Stay di nota mitra, dan{' '}
                  {notesYangDilunasiPadaModeStay.length} transaksi lain ({formatRupiah(nominalPotong)}) langsung LUNAS ke History.
                </span>
              </div>
            ) : stayOverLimit ? (
              <div className="text-[11px] text-rose-800 font-semibold flex items-start gap-1.5 pt-1 border-t border-rose-200">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  Total bon Stay melebihi sisa piutang sebesar {formatRupiah(totalStaySisa - sisaPiutangSetelahPotong)}. Hapus sebagian centang Stay atau kecilkan nominal potong silang.
                </span>
              </div>
            ) : stayBonIds.length > 0 ? (
              <div className="text-[11px] text-amber-900 pt-1 border-t border-amber-200/70">
                Masih kurang <strong className="font-mono">{formatRupiah(staySelisih)}</strong> lagi untuk menyamai sisa piutang{' '}
                <strong className="font-mono">{formatRupiah(sisaPiutangSetelahPotong)}</strong>. Transaksi yang dicentang tetap aman (Stay).
              </div>
            ) : (
              <div className="text-[11px] text-zinc-600 pt-1 border-t border-zinc-200/70">
                Centang transaksi di bawah ini yang masih <strong>Stay (Belum Dibayar)</strong> hingga totalnya sama dengan{' '}
                <strong className="font-mono text-zinc-900">{formatRupiah(sisaPiutangSetelahPotong)}</strong>.
              </div>
            )}
          </div>

          <div className={`${compact ? 'max-h-60' : 'max-h-64'} overflow-y-auto space-y-1.5 pr-0.5`}>
            {loadingOpenNotes ? (
              <div className="py-3 text-center text-zinc-500">Memuat daftar transaksi bon aktif...</div>
            ) : (
              openBonNotes.map((note) => {
                const isStay = stayBonIds.includes(note.refId);
                return (
                  <label
                    key={note.refId}
                    className={`flex items-start justify-between gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isStay
                        ? 'bg-rose-50/90 border-rose-400'
                        : 'bg-white border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isStay}
                        onChange={() => toggleStayNote(note.refId)}
                        className="mt-0.5 rounded border-rose-500 accent-rose-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] text-zinc-900 font-bold leading-snug break-words">
                          {note.ringkasan}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-zinc-500">
                            {note.tanggal} · {note.parentRefId}
                          </span>
                          {note.isNotaNgunci && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-bold">
                              NGUNCI
                            </span>
                          )}
                          {isStay ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-700 text-white text-[9px] font-bold">
                              STAY / BELUM BAYAR
                            </span>
                          ) : (
                            stayBonIds.length > 0 &&
                            !stayOverLimit && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                                DILUNASI → HISTORY
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div className={`font-black text-xs ${isStay ? 'text-rose-800' : 'text-zinc-900'}`}>
                        {formatRupiah(note.sisa)}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}

      {caraAlokasi === 'PILIH_NOTA' && (
        <div className="space-y-2">
          <p className="text-[11px] text-amber-900 leading-snug">
            Centang <strong>HANYA transaksi/item piutang yang ingin dilunasi sekarang</strong>. Yang sudah lunas otomatis pindah ke <em>History Transaksi</em>, sedangkan lainnya tetap tampil di Rekening Koran.
          </p>
          <div className={`${compact ? 'max-h-56' : 'max-h-60'} overflow-y-auto space-y-1.5 pr-0.5`}>
            {loadingOpenNotes ? (
              <div className="py-3 text-center text-zinc-500">Memuat daftar transaksi bon aktif...</div>
            ) : (
              openBonNotes.map((note) => {
                const isChecked = selectedTargetBonIds.includes(note.refId);
                return (
                  <label
                    key={note.refId}
                    className={`flex items-start justify-between gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-emerald-50/90 border-emerald-500'
                        : 'bg-white border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTargetNote(note.refId)}
                        className="mt-0.5 rounded border-emerald-600 accent-emerald-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] text-zinc-900 font-bold leading-snug break-words">
                          {note.ringkasan}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-zinc-500">
                            {note.tanggal} · {note.parentRefId}
                          </span>
                          {note.isNotaNgunci && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-bold">
                              NGUNCI
                            </span>
                          )}
                          {isChecked && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[9px] font-bold">
                              DILUNASI
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div className="font-black text-xs text-amber-950">
                        {formatRupiah(note.sisa)}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {selectedTargetBonIds.length > 0 && (
            <div className="p-2.5 rounded-lg bg-white border border-amber-300 text-[11px] space-y-1">
              <div className="flex justify-between gap-2 text-emerald-900">
                <span>
                  Akan dilunasi ({selectedTargetBonIds.length} transaksi → pindah ke History):
                </span>
                <strong className="font-mono tabular-nums">
                  {formatRupiah(Math.min(totalTargetLunasSisa, maxPotongSilang))}
                </strong>
              </div>
              {notesYangStayPadaModePilihLunas.length > 0 && (
                <div className="text-zinc-600 leading-snug pt-1 border-t border-zinc-100">
                  <strong className="text-zinc-900">
                    Tetap tersisa di Rekening Koran ({notesYangStayPadaModePilihLunas.length} transaksi):
                  </strong>{' '}
                  {notesYangStayPadaModePilihLunas
                    .map((n) => `${n.ringkasan} (${formatRupiah(n.sisa)})`)
                    .join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {caraAlokasi === 'OTOMATIS_FIFO' && (
        <p className="text-[11px] text-amber-900/85 leading-snug">
          Mode otomatis akan melunasi piutang dari yang paling lama terlebih dahulu. Klik{' '}
          <strong>Pilih Bon Stay</strong> bila ingin mencentang per transaksi mana saja yang tetap belum dibayar.
        </p>
      )}
    </div>
  );
};
