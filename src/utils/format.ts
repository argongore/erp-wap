/**
 * Indonesian Rupiah and Date/Time Formatters for ERP Wijaya Agro
 */

export function formatRupiah(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Rp 0';
  }
  const rounded = Math.round(amount);
  if (rounded < 0) {
    return `-Rp ${Math.abs(rounded).toLocaleString('id-ID')}`;
  }
  return `Rp ${rounded.toLocaleString('id-ID')}`;
}

export function formatRupiahSingkat(
  amount: number | null | undefined,
  maxDecimals: number = 2
): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Rp 0';
  }
  const rounded = Math.round(amount);
  if (rounded === 0) {
    return 'Rp 0';
  }

  const isNegative = rounded < 0;
  const abs = Math.abs(rounded);
  const prefix = isNegative ? '-Rp ' : 'Rp ';

  const units = [
    { threshold: 1_000_000_000_000, symbol: 'T' },
    { threshold: 1_000_000_000, symbol: 'M' },
    { threshold: 1_000_000, symbol: 'Jt' },
    { threshold: 1_000, symbol: 'Rb' },
  ];

  const factor = Math.pow(10, maxDecimals);
  for (let i = 0; i < units.length; i++) {
    const { threshold, symbol } = units[i];
    if (abs >= threshold) {
      const scaled = Math.round((abs / threshold) * factor) / factor;
      if (scaled >= 1000 && i > 0) {
        const higher = units[i - 1];
        const higherScaled = Math.round((abs / higher.threshold) * factor) / factor;
        return `${prefix}${higherScaled.toLocaleString('id-ID', {
          minimumFractionDigits: 0,
          maximumFractionDigits: maxDecimals,
        })} ${higher.symbol}`;
      }
      return `${prefix}${scaled.toLocaleString('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals,
      })} ${symbol}`;
    }
  }

  return `${prefix}${abs.toLocaleString('id-ID')}`;
}

export function parseRupiahInput(value: string): number {
  const clean = value.replace(/[^0-9]/g, '');
  return clean ? parseInt(clean, 10) : 0;
}

export function formatTanggalIndo(dateStr?: string): string {
  if (!dateStr) return '-';
  // If already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return dateStr;
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export function formatJamIndo(isoOrTime?: string): string {
  if (!isoOrTime) return '-';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(isoOrTime)) {
    return isoOrTime;
  }
  try {
    const d = new Date(isoOrTime);
    if (isNaN(d.getTime())) return isoOrTime;
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/\./g, ':');
  } catch {
    return isoOrTime;
  }
}

export function getWIBTodayString(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
