import React, { useState } from 'react';
import { Printer, X, CheckCircle2, Copy, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { formatRupiah } from '../../utils/format.ts';
import type { ProfilPerusahaan } from '../../server/types.ts';

export interface ReceiptData {
  title?: string;
  subtitle?: string;
  nomorTransaksi?: string;
  nomorNota?: string;
  tanggal?: string;
  jam?: string;
  mitra?: string;
  namaMitra?: string;
  roleMitra?: string;
  rekening?: string;
  kategori?: string;
  total?: number;
  terbilang?: string;
  items?: Array<{ nama?: string; qty?: number; satuan?: string; harga?: number; subtotal?: number }>;
  detailRows?: Array<{ label?: string; value?: string | number; isTotal?: boolean; highlight?: boolean }>;
  catatan?: string;
  kasir?: string;
  fotoNota?: string;
  [key: string]: any;
}

interface Props {
  receipt: ReceiptData | null;
  onClose: () => void;
  onRefresh?: () => void;
  profilPerusahaan?: ProfilPerusahaan | null;
}

export const PrintReceiptModal: React.FC<Props> = ({ receipt, onClose, onRefresh, profilPerusahaan }) => {
  const [copied, setCopied] = useState(false);
  const [printError, setPrintError] = useState('');
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  if (!receipt) return null;

  const handleCloseAndRefresh = () => {
    onClose();
    if (onRefresh) {
      try {
        onRefresh();
      } catch (e) {
        console.warn('onRefresh callback error:', e);
      }
    }
  };

  const handlePrint = () => {
    setPrintError('');
    try {
      window.print();
    } catch (e) {
      console.warn('Print dialog prevented by browser/iframe sandbox:', e);
      setPrintError('Dialog cetak browser dibatasi oleh iframe. Silakan gunakan tombol "Salin Bukti".');
    }
  };

  const companyName = profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA';
  const companyTagline =
    profilPerusahaan?.catatanHeaderNota ||
    profilPerusahaan?.badanHukum ||
    'Perdagangan Hasil Bumi, Beras & Sarana Pertanian Terpadu';
  const companyContact = `${profilPerusahaan?.alamat || '-'}${
    profilPerusahaan?.telepon ? ` · Telp: ${profilPerusahaan.telepon}` : ''
  }`;

  const handleCopyReceipt = () => {
    try {
      const lines = [
        `*BUKTI TRANSAKSI ${companyName.toUpperCase()}*`,
        `${receipt.title || 'BUKTI TRANSAKSI'} - ${receipt.nomorTransaksi || '-'}`,
        `Waktu: ${receipt.tanggal || '-'} ${receipt.jam || ''} WIB`,
        `Mitra/Pihak: ${receipt.mitra || receipt.namaMitra || '-'}`,
        `---------------------------------`,
      ];
      if (Array.isArray(receipt.items) && receipt.items.length > 0) {
        receipt.items.forEach((it) => {
          if (!it) return;
          const hrg = Number(it.harga) || 0;
          const subtot = Number(it.subtotal) || 0;
          lines.push(`• ${it.nama || 'Item'} (${it.qty || 1} ${it.satuan || 'Pcs'} x Rp ${hrg.toLocaleString('id-ID')}) = Rp ${subtot.toLocaleString('id-ID')}`);
        });
        lines.push(`---------------------------------`);
      }
      if (Array.isArray(receipt.detailRows)) {
        receipt.detailRows.forEach((r) => {
          if (!r) return;
          const valStr = typeof r.value === 'number' ? formatRupiah(r.value) : String(r.value ?? '-');
          lines.push(`${r.label || 'Keterangan'}: ${valStr}`);
        });
      }
      if (receipt.catatan) {
        lines.push(`Keterangan: ${receipt.catatan}`);
      }

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }).catch(() => {
          setCopied(false);
        });
      }
    } catch (err) {
      console.warn('Gagal menyalin bukti:', err);
    }
  };

  const itemsList = Array.isArray(receipt.items) ? receipt.items.filter(Boolean) : [];
  const detailRowsList = Array.isArray(receipt.detailRows) ? receipt.detailRows.filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white text-zinc-900 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-zinc-200 animate-in fade-in zoom-in duration-150">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-800 text-white">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            <span className="font-semibold text-sm tracking-wide">Transaksi Berhasil Disimpan</span>
          </div>
          <button
            type="button"
            onClick={handleCloseAndRefresh}
            className="text-emerald-200 hover:text-white p-1 rounded-md hover:bg-emerald-700/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Paper Area */}
        <div id="printable-receipt" className="p-6 bg-white text-xs leading-relaxed space-y-4">
          {/* Company Brand */}
          <div className="text-center border-b border-zinc-200 pb-3">
            <h1 className="text-base font-bold tracking-tight text-zinc-900 uppercase">{companyName}</h1>
            <p className="text-[11px] text-zinc-600">{companyTagline}</p>
            <p className="text-[10px] text-zinc-500">{companyContact}</p>
          </div>

          {/* Receipt Title */}
          <div className="flex justify-between items-center text-zinc-700 border-b border-dashed border-zinc-300 pb-2">
            <div>
              <span className="font-bold text-xs uppercase tracking-wide text-emerald-900">{receipt.title || 'BUKTI TRANSAKSI'}</span>
              {receipt.subtitle && <p className="text-[11px] text-zinc-500">{receipt.subtitle}</p>}
            </div>
            <div className="text-right">
              <span className="font-mono font-semibold text-zinc-900">{receipt.nomorTransaksi || '-'}</span>
              <p className="text-[10px] text-zinc-500">
                {receipt.tanggal || '-'} · {receipt.jam || ''} WIB
              </p>
            </div>
          </div>

          {/* Table Items if available (Penjualan) */}
          {itemsList.length > 0 && (
            <div className="space-y-1">
              <div className="grid grid-cols-12 text-[10px] font-semibold text-zinc-600 border-b border-zinc-200 pb-1">
                <span className="col-span-6">PRODUK</span>
                <span className="col-span-3 text-right">QTY x HARGA</span>
                <span className="col-span-3 text-right">TOTAL</span>
              </div>
              <div className="space-y-1.5 py-1">
                {itemsList.map((it, idx) => {
                  const hrg = Number(it.harga) || 0;
                  const subtot = Number(it.subtotal) || 0;
                  return (
                    <div key={idx} className="grid grid-cols-12 text-[11px] text-zinc-800">
                      <span className="col-span-6 font-medium truncate">{it.nama || '-'}</span>
                      <span className="col-span-3 text-right text-zinc-600">
                        {it.qty || 1} {it.satuan || 'Pcs'} x {hrg === 0 ? 'Rp 0' : hrg.toLocaleString('id-ID')}
                      </span>
                      <span className="col-span-3 text-right font-semibold">
                        {subtot === 0 ? <span className="text-blue-700 font-bold">Rp 0 (PT)</span> : formatRupiah(subtot)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detail Rows */}
          {detailRowsList.length > 0 && (
            <div className="border-t border-zinc-200 pt-2 space-y-1.5">
              {detailRowsList.map((row, i) => {
                const valStr = typeof row.value === 'number' ? formatRupiah(row.value) : String(row.value ?? '-');
                return (
                  <div
                    key={i}
                    className={`flex justify-between items-center py-0.5 ${
                      row.isTotal ? 'border-t border-zinc-300 pt-2 text-sm font-bold text-zinc-900' : 'text-xs text-zinc-700'
                    } ${row.highlight ? 'text-emerald-700 font-semibold' : ''}`}
                  >
                    <span>{row.label || '-'}</span>
                    <span>{valStr}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          {receipt.catatan && (
            <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200 text-[11px] text-zinc-600">
              <span className="font-semibold text-zinc-700">Keterangan:</span> {receipt.catatan}
            </div>
          )}

          {/* Attached Receipt Image */}
          {receipt.fotoNota && (
            <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                  📷 Lampiran Foto Nota / Bukti Fisik:
                </span>
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(true)}
                  className="text-[10px] text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                >
                  Perbesar Gambar
                </button>
              </div>
              <div
                onClick={() => setShowPhotoModal(true)}
                className="max-h-48 overflow-hidden rounded border border-amber-300 bg-white flex items-center justify-center cursor-zoom-in group"
              >
                <img
                  src={receipt.fotoNota}
                  alt="Lampiran Nota Fisik"
                  className="max-h-48 w-auto object-contain group-hover:scale-102 transition-transform"
                />
              </div>
            </div>
          )}

          {/* Signatures */}
          <div className="pt-4 grid grid-cols-2 text-center text-[10px] text-zinc-500 border-t border-dashed border-zinc-300">
            <div>
              <p>Operator Kasir</p>
              <div className="h-10"></div>
              <p className="font-semibold text-zinc-800">({receipt.kasir || 'Kasir PT Wijaya Agro'})</p>
            </div>
            <div>
              <p>Pihak Terkait / Mitra</p>
              <div className="h-10"></div>
              <p className="font-semibold text-zinc-800">({receipt.mitra || receipt.namaMitra || 'Tanda Tangan'})</p>
            </div>
          </div>

          <div className="text-center text-[9px] text-zinc-400 pt-1">
            Dicetak otomatis oleh Sistem ERP Wijaya Agro · Tersimpan aman di Cloud Supabase
          </div>
        </div>

        {/* Full Image Lightbox */}
        {showPhotoModal && receipt.fotoNota && (
          <div
            onClick={() => setShowPhotoModal(false)}
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 p-3 rounded-2xl max-w-3xl w-full border border-zinc-700 space-y-2 cursor-default"
            >
              <div className="flex items-center justify-between text-white text-xs pb-1 border-b border-zinc-800">
                <span className="font-bold">Foto Nota Fisik: {receipt.nomorTransaksi || '-'}</span>
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(false)}
                  className="text-zinc-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕ Tutup
                </button>
              </div>
              <div className="max-h-[80vh] overflow-auto flex items-center justify-center bg-black rounded-lg p-2">
                <img src={receipt.fotoNota} alt="Foto Nota Penuh" className="max-h-[75vh] w-auto object-contain" />
              </div>
            </div>
          </div>
        )}

        {printError && (
          <div className="px-5 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{printError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-zinc-50 border-t border-zinc-200">
          <button
            type="button"
            onClick={handleCopyReceipt}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Tersalin!' : 'Salin Bukti (WA)'}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 bg-zinc-200 hover:bg-zinc-300 rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Struk</span>
            </button>

            <button
              type="button"
              onClick={handleCloseAndRefresh}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-300" />
              <span>Selesai &amp; Auto Refresh</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
