import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Share2,
  ExternalLink,
  ShieldCheck,
  X,
  MessageCircle,
  User,
  Calendar,
} from 'lucide-react';
import { api } from '../../api/client.ts';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  shareType: 'rekening-koran' | 'rekap-harian';
  targetId?: string; // idMitra for rekening-koran
  targetName?: string; // namaMitra or 'Rekap Harian'
  targetDate?: string; // tanggal if applicable
  companyName?: string;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  shareType,
  targetId,
  targetName,
  targetDate,
  companyName,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [fetchedCompanyName, setFetchedCompanyName] = useState<string>('');

  useEffect(() => {
    if (isOpen && !companyName) {
      api
        .getProfilPerusahaan()
        .then((res) => {
          if (res?.namaPerusahaan) setFetchedCompanyName(res.namaPerusahaan);
        })
        .catch(() => {});
    }
  }, [isOpen, companyName]);

  if (!isOpen) return null;

  const resolvedCompanyName =
    companyName?.trim() || fetchedCompanyName.trim() || 'PT. WIJAYA AGRO PERKASA';

  // Build full public URL based on current host & pathname
  const baseUrl = window.location.origin + window.location.pathname;
  const searchParams = new URLSearchParams();
  searchParams.set('share', shareType);
  if (targetId) searchParams.set('id', targetId);
  if (targetDate) searchParams.set('tgl', targetDate);

  const fullShareUrl = `${baseUrl}?${searchParams.toString()}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(fullShareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const whatsappMessage =
    shareType === 'rekening-koran'
      ? `Halo ${targetName ? `Bapak/Ibu *${targetName}*` : 'Bapak/Ibu'}, berikut kami kirimkan tautan resmi *Rekening Koran & Catatan Mutasi* Anda di *${resolvedCompanyName}*:\n\n🔗 ${fullShareUrl}\n\nMelalui tautan ini Anda dapat mengecek rincian kasbon, saldo titipan hasil panen, foto bukti nota fisik, serta mengunduh dokumen resmi dalam format PDF.\n\nTerima kasih.`
      : `Halo, berikut tautan resmi *Rekapitulasi Transaksi Harian* (${targetDate || 'Hari Ini'}) *${resolvedCompanyName}*:\n\n🔗 ${fullShareUrl}\n\nDokumen resmi dapat diakses secara langsung dan diunduh dalam format PDF.`;

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-indigo-800 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-indigo-200 border border-white/15">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white">{title}</h3>
              <p className="text-[11px] text-indigo-200">
                {subtitle || 'Bagikan tautan langsung khusus penerima (Hanya Baca / Read-Only)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Target Info Card */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-900">
              <span className="flex items-center space-x-1.5">
                {shareType === 'rekening-koran' ? <User className="w-3.5 h-3.5 text-indigo-700" /> : <Calendar className="w-3.5 h-3.5 text-indigo-700" />}
                <span>{shareType === 'rekening-koran' ? 'Mitra / Petani Penerima:' : 'Rekap Tanggal:'}</span>
              </span>
              <span className="font-bold text-zinc-900">{targetName || targetDate || '-'}</span>
            </div>
            {targetId && (
              <div className="text-[10px] text-indigo-700 font-mono">
                ID Dokumen: {targetId}
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-2.5 text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-[11px]">Aman &amp; Terproteksi (Hanya Baca):</p>
              <p className="text-[10px] text-emerald-800 leading-relaxed">
                Penerima tautan <strong>HANYA BISA MELIHAT</strong> rekap yang dibagikan ini saja. Mereka tidak bisa melihat menu kasir, tidak bisa mengubah data, dan tidak bisa melihat data mitra lainnya.
              </p>
            </div>
          </div>

          {/* Link Box */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-zinc-700 text-xs">
              Tautan Publik Khusus:
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 px-3 py-2 bg-zinc-100 border border-zinc-300 rounded-xl text-zinc-800 font-mono text-[11px] select-all truncate">
                {fullShareUrl}
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className={`flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-xs shrink-0 ${
                  copied
                    ? 'bg-emerald-700 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin!' : 'Salin Link'}</span>
              </button>
            </div>
          </div>

          {/* Actions: Send WhatsApp & Preview */}
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Kirim ke WhatsApp</span>
            </a>

            <a
              href={fullShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka Pratinjau Tautan</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
