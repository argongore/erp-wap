import React from 'react';
import { RekapSemuaTransaksiHarianView } from './RekapSemuaTransaksiHarianView.tsx';

interface Props {
  recentTransactions?: Array<{
    id: string;
    tanggal: string;
    jam: string;
    createdAt: string;
    kategori: string;
    label: string;
    nominal: number;
    pihakTerkait: string;
    rekening: string;
    status: string;
    fotoNota?: string;
  }>;
  onRefreshParent?: () => void;
}

export const RekapTransaksiView: React.FC<Props> = ({ onRefreshParent }) => {
  return <RekapSemuaTransaksiHarianView onRefreshParent={onRefreshParent} />;
};
