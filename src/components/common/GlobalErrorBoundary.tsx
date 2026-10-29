import React from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('GlobalErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleResetState = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-zinc-900 text-white flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 max-w-lg w-full text-center space-y-5 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto text-2xl font-bold">
              ⚡
            </div>

            <div className="space-y-2">
              <h1 className="text-lg sm:text-xl font-bold text-white">
                Sistem Otomatis Pulih &amp; Data Tersimpan
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Input transaksi Anda telah aman tercatat di database lokal &amp; Cloud Supabase. Tampilan aplikasi dapat dipulihkan secara instan dengan menekan tombol di bawah.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-left text-[11px] font-mono text-zinc-400 overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleResetState}
                className="w-full sm:w-auto px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl border border-zinc-700 transition-colors flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-zinc-400" />
                <span>Kembali ke Halaman</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-emerald-200" />
                <span>Muat Ulang &amp; Auto Refresh</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
