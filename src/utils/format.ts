/**
 * Indonesian Rupiah and Date/Time Formatters for ERP Wijaya Agro
 */

export function formatRupiah(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Rp 0';
  }
  const rounded = Math.round(amount);
  return `Rp ${rounded.toLocaleString('id-ID')}`;
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
