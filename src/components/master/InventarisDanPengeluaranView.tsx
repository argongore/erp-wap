import React, { useState, useEffect } from 'react';
import { Truck, Receipt, Boxes, Fuel } from 'lucide-react';
import { ItemInventaris, Karyawan, Rekening, TransaksiPengeluaran } from '../../server/types.ts';
import { MasterInventarisView } from './MasterInventarisView.tsx';
import { PengeluaranView } from '../kasir/PengeluaranView.tsx';

interface Props {
  inventarisList: ItemInventaris[];
  pengeluaranList: TransaksiPengeluaran[];
  rekeningList: Rekening[];
  karyawanList?: Karyawan[];
  initialSubMenu?: 'INVENTARIS' | 'PENGELUARAN';
  preselectedInventarisId?: string | null;
  onClearPreselectedInventaris?: () => void;
  onRefresh: () => void;
}

export const InventarisDanPengeluaranView: React.FC<Props> = ({
  inventarisList,
  pengeluaranList,
  rekeningList,
  karyawanList = [],
  initialSubMenu = 'INVENTARIS',
  preselectedInventarisId = null,
  onClearPreselectedInventaris,
  onRefresh,
}) => {
  const [subMenu, setSubMenu] = useState<'INVENTARIS' | 'PENGELUARAN'>(initialSubMenu);
  const [localInventarisId, setLocalInventarisId] = useState<string | null>(
    preselectedInventarisId
  );

  useEffect(() => {
    setSubMenu(initialSubMenu);
  }, [initialSubMenu]);

  useEffect(() => {
    if (preselectedInventarisId) {
      setLocalInventarisId(preselectedInventarisId);
      setSubMenu('PENGELUARAN');
    }
  }, [preselectedInventarisId]);

  return (
    <div className="space-y-5">
      {/* Dual Sub-Menu Switcher: HIJAU = INVENTARIS | ORANYE = PENGELUARAN */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
              Inventaris &amp; Pengeluaran
            </h1>
            <p className="text-xs text-zinc-500">
              Pilih sub-menu <strong className="text-emerald-700">Inventaris</strong> (data aset gudang &amp; STNK armada) atau <strong className="text-orange-700">Rekapan 24 Item Pengeluaran</strong> (Form Hijau Inventaris No. 1–16 &amp; Form Oranye Pengeluaran Biasa No. 17–24).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* SUB MENU 1: HIJAU (INVENTARIS) */}
          <button
            type="button"
            onClick={() => setSubMenu('INVENTARIS')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
              subMenu === 'INVENTARIS'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                : 'bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-950 border-emerald-300'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`p-2.5 rounded-lg shrink-0 ${
                  subMenu === 'INVENTARIS'
                    ? 'bg-emerald-700 text-emerald-100'
                    : 'bg-emerald-200/80 text-emerald-900'
                }`}
              >
                <Truck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-black tracking-tight truncate">
                  1. SUB-MENU DATA INVENTARIS
                </div>
                <div
                  className={`text-[11px] truncate ${
                    subMenu === 'INVENTARIS' ? 'text-emerald-100' : 'text-emerald-800'
                  }`}
                >
                  Aset Gudang, Mesin, Armada Kendaraan &amp; Pajak STNK ({inventarisList.length} Unit)
                </div>
              </div>
            </div>
          </button>

          {/* SUB MENU 2: REKAPAN 24 ITEM PENGELUARAN (DUAL FORM HIJAU & ORANYE) */}
          <button
            type="button"
            onClick={() => setSubMenu('PENGELUARAN')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
              subMenu === 'PENGELUARAN'
                ? 'bg-orange-600 text-white border-orange-700 shadow-sm'
                : 'bg-orange-50/70 hover:bg-orange-100/70 text-orange-950 border-orange-300'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`p-2.5 rounded-lg shrink-0 ${
                  subMenu === 'PENGELUARAN'
                    ? 'bg-orange-700 text-orange-100'
                    : 'bg-orange-200/80 text-orange-900'
                }`}
              >
                <Fuel className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-black tracking-tight truncate">
                  2. SUB-MENU 24 ITEM PENGELUARAN
                </div>
                <div
                  className={`text-[11px] truncate ${
                    subMenu === 'PENGELUARAN' ? 'text-orange-100' : 'text-orange-800'
                  }`}
                >
                  Form Hijau (Inventaris 1–16) &amp; Form Oranye (Biasa 17–24) · {pengeluaranList.length} Catatan
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Content Area Based on Selected Sub-Menu */}
      {subMenu === 'INVENTARIS' ? (
        <MasterInventarisView
          inventarisList={inventarisList}
          karyawanList={karyawanList}
          pengeluaranList={pengeluaranList}
          onRefresh={onRefresh}
          onNavigateToPengeluaran={(inv) => {
            setLocalInventarisId(inv.id);
            setSubMenu('PENGELUARAN');
          }}
        />
      ) : (
        <PengeluaranView
          rekeningList={rekeningList}
          inventarisList={inventarisList}
          karyawanList={karyawanList}
          preselectedInventarisId={localInventarisId}
          onClearPreselectedInventaris={() => {
            setLocalInventarisId(null);
            onClearPreselectedInventaris?.();
          }}
          onOpenInventarisMenu={() => setSubMenu('INVENTARIS')}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};
