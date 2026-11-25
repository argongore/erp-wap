import React, { useEffect, useState } from 'react';
import {
  Printer,
  X,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Bluetooth,
  Smartphone,
  SlidersHorizontal,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatRupiah } from '../../utils/format.ts';
import type { ProfilPerusahaan } from '../../server/types.ts';
import {
  buildReceiptTextForWa,
  disconnectBluetoothPrinter,
  getConnectedBluetoothPrinterName,
  getThermalSettings,
  isWebBluetoothSupported,
  printThermalReceiptBrowser,
  printThermalViaBluetooth,
  printThermalViaRawBt,
  saveThermalSettings,
  type ThermalReceiptSettings,
} from '../../utils/thermalPrint.ts';

export interface ReceiptData {
  title?: string;
  subtitle?: string;
  modalHeaderTitle?: string;
  mitraLabel?: string;
  itemsHeaderLeft?: string;
  itemsHeaderRight?: string;
  signatureRightLabel?: string;
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
  items?: Array<{
    nama?: string;
    qty?: number;
    satuan?: string;
    harga?: number;
    subtotal?: number;
    detailLine?: string;
    subtotalText?: string;
  }>;
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
  onSettingsChanged?: (settings: ThermalReceiptSettings) => void;
}

export const PrintReceiptModal: React.FC<Props> = ({
  receipt,
  onClose,
  onRefresh,
  profilPerusahaan,
  onSettingsChanged,
}) => {
  const [copied, setCopied] = useState(false);
  const [printError, setPrintError] = useState('');
  const [printNotice, setPrintNotice] = useState('');
  const [printingThermal, setPrintingThermal] = useState(false);
  const [printingBt, setPrintingBt] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showPrinterOptions, setShowPrinterOptions] = useState(false);
  const [settings, setSettings] = useState<ThermalReceiptSettings>(() => getThermalSettings());
  const [btPrinterName, setBtPrinterName] = useState<string | null>(() =>
    getConnectedBluetoothPrinterName()
  );

  // Sync settings from storage when modal opens for a new receipt
  useEffect(() => {
    if (!receipt) return;
    setSettings(getThermalSettings());
    setBtPrinterName(getConnectedBluetoothPrinterName());
    setPrintError('');
    setPrintNotice('');
  }, [receipt]);

  // Allow fast close with Escape key so cashier workflow stays fast
  useEffect(() => {
    if (!receipt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPhotoModal) {
          setShowPhotoModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [receipt, showPhotoModal, onClose]);

  if (!receipt) return null;

  const updateSetting = (patch: Partial<ThermalReceiptSettings>) => {
    const next = saveThermalSettings(patch);
    setSettings(next);
    onSettingsChanged?.(next);
  };

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

  const handlePrintThermal = async () => {
    setPrintError('');
    setPrintNotice('');
    setPrintingThermal(true);
    try {
      const res = await printThermalReceiptBrowser(receipt, profilPerusahaan, settings);
      if (!res.ok) {
        setPrintError(res.message || 'Gagal membuka cetak struk thermal.');
      } else {
        setPrintNotice(`Struk ${settings.paperWidthMm}mm dikirim ke dialog printer.`);
      }
    } finally {
      setPrintingThermal(false);
    }
  };

  const handlePrintBluetooth = async () => {
    setPrintError('');
    setPrintNotice('');
    setPrintingBt(true);
    try {
      const res = await printThermalViaBluetooth(receipt, profilPerusahaan, settings);
      if (res.ok) {
        setBtPrinterName(res.printerName || getConnectedBluetoothPrinterName());
        setPrintNotice(
          `Struk ${settings.paperWidthMm}mm berhasil dicetak langsung ke ${
            res.printerName || 'Printer Bluetooth'
          }.`
        );
      } else {
        setPrintError(res.message || 'Gagal mencetak via Bluetooth ESC/POS.');
      }
    } finally {
      setPrintingBt(false);
    }
  };

  const handlePrintRawBt = () => {
    setPrintError('');
    setPrintNotice('');
    const res = printThermalViaRawBt(receipt, profilPerusahaan, settings);
    if (res.ok) {
      setPrintNotice(`Perintah ESC/POS ${settings.paperWidthMm}mm dikirim ke aplikasi RawBT.`);
    } else {
      setPrintError(res.message || 'Gagal mengirim ke RawBT.');
    }
  };

  const handleCopyReceipt = () => {
    try {
      const text = buildReceiptTextForWa(receipt, profilPerusahaan);
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          })
          .catch(() => setCopied(false));
      }
    } catch (err) {
      console.warn('Gagal menyalin bukti:', err);
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

  const itemsList = Array.isArray(receipt.items) ? receipt.items.filter(Boolean) : [];
  const detailRowsList = Array.isArray(receipt.detailRows) ? receipt.detailRows.filter(Boolean) : [];
  const hasExplicitTotalRow = detailRowsList.some((r) => Boolean(r.isTotal));
  const noTx = receipt.nomorTransaksi || receipt.nomorNota || '-';
  const pihak = receipt.mitra || receipt.namaMitra || '';
  const kasir = receipt.kasir || 'Kasir PT Wijaya Agro';

  const mitraLabel = receipt.mitraLabel || 'Mitra/Pihak';
  const itemsHeaderLeft = receipt.itemsHeaderLeft || 'ITEM / RINCIAN';
  const itemsHeaderRight = receipt.itemsHeaderRight || 'SUBTOTAL';
  const signatureRightLabel = receipt.signatureRightLabel || 'Mitra / Penerima';

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white text-zinc-900 w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-zinc-200 animate-in fade-in zoom-in duration-150 my-auto">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-800 text-white">
          <div className="flex items-center space-x-2 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-sm tracking-wide truncate">
                {receipt.modalHeaderTitle || 'Transaksi Berhasil Disimpan'}
              </div>
              <div className="text-[10px] text-emerald-200">
                Format Thermal {settings.paperWidthMm}mm · Cetak bersifat opsional
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseAndRefresh}
            className="text-emerald-200 hover:text-white p-1 rounded-md hover:bg-emerald-700/50 transition-colors cursor-pointer shrink-0"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fast Mode Toggle Strip (Opt-in so cashier speed is never interrupted) */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
            <input
              type="checkbox"
              checked={settings.fastModeSkipPopup}
              onChange={(e) => updateSetting({ fastModeSkipPopup: e.target.checked })}
              className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
            />
            <span className="inline-flex items-center gap-1 font-semibold">
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              Mode Cepat Kasir (lewati popup, notif cetak di pojok)
            </span>
          </label>
        </div>

        {/* Thermal 80mm Paper Preview Area */}
        <div className="p-4 bg-slate-100/90 max-h-[58vh] overflow-y-auto flex justify-center">
          <div
            id="printable-receipt"
            className={`bg-white text-black font-mono shadow-sm border border-dashed border-zinc-300 px-4 py-4 text-[11px] leading-snug space-y-2.5 ${
              settings.paperWidthMm === 58 ? 'w-[250px]' : 'w-[320px]'
            }`}
          >
            {/* Company Brand */}
            <div className="text-center border-b border-dashed border-zinc-800 pb-2.5 space-y-0.5">
              <h1 className="text-[13px] font-black tracking-tight text-black uppercase leading-tight">
                {companyName}
              </h1>
              <p className="text-[10px] text-zinc-700 leading-tight">{companyTagline}</p>
              <p className="text-[9.5px] text-zinc-600 leading-tight">{companyContact}</p>
            </div>

            {/* Receipt Title */}
            <div className="text-center border-b border-dashed border-zinc-800 pb-2">
              <div className="font-black text-xs uppercase tracking-wide text-black">
                {receipt.title || 'BUKTI TRANSAKSI'}
              </div>
              {receipt.subtitle && <div className="text-[10px] text-zinc-700">{receipt.subtitle}</div>}
            </div>

            {/* Metadata */}
            <div className="space-y-0.5 text-[10.5px]">
              <div className="flex justify-between gap-2">
                <span className="text-zinc-600">No. Trx</span>
                <span className="font-bold text-black text-right">{noTx}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-600">Waktu</span>
                <span className="text-black text-right">
                  {receipt.tanggal || '-'} {receipt.jam || ''} WIB
                </span>
              </div>
              {pihak && (
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-600">{mitraLabel}</span>
                  <span className="font-bold text-black text-right truncate max-w-[180px]">
                    {pihak}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-zinc-600">Kasir</span>
                <span className="text-black text-right">{kasir}</span>
              </div>
            </div>

            {/* Table Items if available (Penjualan / Kulakan / Rincian Harian Gaji) */}
            {itemsList.length > 0 && (
              <div className="border-t border-dashed border-zinc-800 pt-2 space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold text-black border-b border-dotted border-zinc-500 pb-1">
                  <span>{itemsHeaderLeft}</span>
                  <span>{itemsHeaderRight}</span>
                </div>
                {itemsList.map((it, idx) => {
                  const hrg = Number(it.harga) || 0;
                  const subtot = Number(it.subtotal) || 0;
                  const leftDetail =
                    it.detailLine !== undefined
                      ? it.detailLine
                      : `${it.qty || 1} ${it.satuan || 'Pcs'} x ${
                          hrg === 0 ? 'Rp 0' : hrg.toLocaleString('id-ID')
                        }`;
                  const rightSubtotal =
                    it.subtotalText !== undefined
                      ? it.subtotalText
                      : subtot === 0
                      ? 'Rp 0 (PT)'
                      : formatRupiah(subtot);
                  return (
                    <div key={idx} className="space-y-0.5">
                      <div className="font-bold text-black break-words">{it.nama || '-'}</div>
                      <div className="flex justify-between gap-2 text-[10px] text-zinc-800">
                        <span className="break-words">{leftDetail}</span>
                        <span className="font-bold text-black whitespace-nowrap">
                          {rightSubtotal}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Detail Rows */}
            {detailRowsList.length > 0 && (
              <div className="border-t border-dashed border-zinc-800 pt-2 space-y-1">
                {detailRowsList.map((row, i) => {
                  const valStr =
                    typeof row.value === 'number' ? formatRupiah(row.value) : String(row.value ?? '-');
                  return (
                    <div
                      key={i}
                      className={`flex justify-between items-start gap-2 ${
                        row.isTotal
                          ? 'border-y border-black py-1.5 my-1 text-xs font-black text-black'
                          : 'text-[10.5px] text-zinc-800'
                      } ${row.highlight ? 'font-bold text-black' : ''}`}
                    >
                      <span className="break-words">{row.label || '-'}</span>
                      <span className="text-right whitespace-nowrap font-bold">{valStr}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!hasExplicitTotalRow && typeof receipt.total === 'number' && (
              <div className="border-y border-black py-1.5 flex justify-between text-xs font-black text-black">
                <span>TOTAL</span>
                <span>{formatRupiah(receipt.total)}</span>
              </div>
            )}

            {/* Notes */}
            {receipt.catatan && (
              <div className="border-t border-dotted border-zinc-500 pt-1.5 text-[10px] text-zinc-800 break-words">
                <span className="font-bold">Ket:</span> {receipt.catatan}
              </div>
            )}

            {/* Attached Receipt Image (screen preview only, excluded from thermal paper) */}
            {receipt.fotoNota && (
              <div className="no-print bg-amber-50/70 p-2 rounded border border-amber-200 space-y-1 font-sans">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-900">Foto Nota Fisik:</span>
                  <button
                    type="button"
                    onClick={() => setShowPhotoModal(true)}
                    className="text-[10px] text-amber-800 font-bold underline cursor-pointer"
                  >
                    Perbesar
                  </button>
                </div>
                <div
                  onClick={() => setShowPhotoModal(true)}
                  className="max-h-28 overflow-hidden rounded border border-amber-300 bg-white flex items-center justify-center cursor-zoom-in"
                >
                  <img
                    src={receipt.fotoNota}
                    alt="Lampiran Nota Fisik"
                    className="max-h-28 w-auto object-contain"
                  />
                </div>
              </div>
            )}

            {/* Signatures */}
            {settings.includeSignatures && (
              <div className="pt-2 grid grid-cols-2 gap-2 text-center text-[9.5px] text-zinc-700 border-t border-dashed border-zinc-800">
                <div>
                  <p>Kasir</p>
                  <div className="h-9" />
                  <p className="font-bold text-black truncate">({kasir})</p>
                </div>
                <div>
                  <p>{signatureRightLabel}</p>
                  <div className="h-9" />
                  <p className="font-bold text-black truncate">({pihak || 'Tanda Tangan'})</p>
                </div>
              </div>
            )}

            <div className="text-center text-[9px] text-zinc-500 pt-1.5 border-t border-dotted border-zinc-400">
              Terima kasih · ERP Wijaya Agro ({settings.paperWidthMm}mm)
            </div>
          </div>
        </div>

        {/* Collapsible Optional Thermal Printer Settings (Bluetooth / RawBT / Paper Size) */}
        <div className="border-t border-zinc-200 bg-white">
          <button
            type="button"
            onClick={() => setShowPrinterOptions((v) => !v)}
            className="w-full px-4 py-2 flex items-center justify-between text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                Opsi Printer Thermal ({settings.paperWidthMm}mm
                {btPrinterName ? ` · BT: ${btPrinterName}` : ''})
              </span>
            </span>
            {showPrinterOptions ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showPrinterOptions && (
            <div className="px-4 pb-3 pt-1 space-y-2.5 bg-zinc-50/70 border-t border-zinc-100 text-[11px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-zinc-600 font-medium">Lebar Kertas:</span>
                <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => updateSetting({ paperWidthMm: 80 })}
                    className={`px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors ${
                      settings.paperWidthMm === 80
                        ? 'bg-emerald-700 text-white'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    80mm (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting({ paperWidthMm: 58 })}
                    className={`px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors border-l border-zinc-300 ${
                      settings.paperWidthMm === 58
                        ? 'bg-emerald-700 text-white'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    58mm
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-zinc-700">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeSignatures}
                    onChange={(e) => updateSetting({ includeSignatures: e.target.checked })}
                    className="rounded border-zinc-300 text-emerald-700 cursor-pointer"
                  />
                  <span>Kolom Tanda Tangan</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoCutEscPos}
                    onChange={(e) => updateSetting({ autoCutEscPos: e.target.checked })}
                    className="rounded border-zinc-300 text-emerald-700 cursor-pointer"
                  />
                  <span>Auto-Cut (ESC/POS)</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={printingBt}
                  onClick={handlePrintBluetooth}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                  title={
                    isWebBluetoothSupported()
                      ? 'Cetak langsung tanpa dialog print via Bluetooth Thermal (ESC/POS)'
                      : 'Web Bluetooth tidak didukung di browser ini'
                  }
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>
                    {printingBt
                      ? 'Mencetak BT...'
                      : btPrinterName
                      ? `Cetak BT (${btPrinterName})`
                      : 'Direct Bluetooth (ESC/POS)'}
                  </span>
                </button>

                {btPrinterName && (
                  <button
                    type="button"
                    onClick={() => {
                      disconnectBluetoothPrinter();
                      setBtPrinterName(null);
                      setPrintNotice('Koneksi Bluetooth printer diputus.');
                    }}
                    className="px-2 py-1.5 rounded-md border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-600 text-[10px] font-semibold cursor-pointer"
                  >
                    Putus BT
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrintRawBt}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-800 font-semibold text-[11px] cursor-pointer"
                  title="Kirim langsung perintah ESC/POS 80mm ke aplikasi RawBT (HP Android)"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Cetak via RawBT (Android)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Full Image Lightbox */}
        {showPhotoModal && receipt.fotoNota && (
          <div
            onClick={() => setShowPhotoModal(false)}
            className="fixed inset-0 z-70 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 p-3 rounded-2xl max-w-3xl w-full border border-zinc-700 space-y-2 cursor-default"
            >
              <div className="flex items-center justify-between text-white text-xs pb-1 border-b border-zinc-800">
                <span className="font-bold">Foto Nota Fisik: {noTx}</span>
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(false)}
                  className="text-zinc-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕ Tutup
                </button>
              </div>
              <div className="max-h-[80vh] overflow-auto flex items-center justify-center bg-black rounded-lg p-2">
                <img
                  src={receipt.fotoNota}
                  alt="Foto Nota Penuh"
                  className="max-h-[75vh] w-auto object-contain"
                />
              </div>
            </div>
          </div>
        )}

        {printError && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{printError}</span>
          </div>
        )}

        {printNotice && !printError && (
          <div className="px-4 py-2 bg-emerald-50 border-t border-emerald-200 text-[11px] text-emerald-800 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{printNotice}</span>
          </div>
        )}

        {/* Action Buttons — Printing is strictly optional */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-zinc-50 border-t border-zinc-200">
          <button
            type="button"
            onClick={handleCopyReceipt}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Tersalin!' : 'Salin WA'}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={printingThermal}
              onClick={handlePrintThermal}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-zinc-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              title={`Cetak struk ukuran ${settings.paperWidthMm}mm ke printer thermal (opsional)`}
            >
              <Printer className="w-4 h-4 text-amber-900" />
              <span>{printingThermal ? 'Menyiapkan...' : `Cetak ${settings.paperWidthMm}mm`}</span>
            </button>

            <button
              type="button"
              onClick={handleCloseAndRefresh}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-300" />
              <span>Selesai</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
