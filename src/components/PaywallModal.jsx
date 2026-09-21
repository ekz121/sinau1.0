import { useState } from 'react'
import { Coins, AlertCircle, Wallet, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppSettings } from '../hooks/useAppSettings'

export default function PaywallModal({ video, userBalance, onPay, onClose }) {
  const [paying, setPaying] = useState(false)
  const navigate = useNavigate()
  const hasEnough = userBalance >= (video?.harga_koin ?? 0)

  const { settings } = useAppSettings(['koin_to_rupiah_rate', 'revenue_split_creator', 'free_preview_seconds'])
  const koinRate = parseInt(settings.koin_to_rupiah_rate ?? '500') || 500
  const creatorSplit = parseInt(settings.revenue_split_creator ?? '80') || 80
  const previewSeconds = parseInt(settings.free_preview_seconds ?? '60') || 60
  const previewLabel = previewSeconds % 60 === 0
    ? `${previewSeconds / 60} menit`
    : `${previewSeconds} detik`

  const handlePay = async () => {
    if (paying) return // prevent double click
    setPaying(true)
    try {
      await onPay()
    } catch {
      // error handled upstream
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="paywall-overlay">
      <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full slide-up">
        {/* Icon */}
        <div className="w-14 h-14 bg-[#FDEDEE] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Coins className="w-7 h-7 text-[#D62839]" />
        </div>

        {/* Text */}
        <h2 className="text-lg font-bold text-[#1F2937] text-center mb-1">
          {previewLabel} gratis habis
        </h2>
        <p className="text-[#6B7280] text-sm text-center mb-5">
          Lanjutkan menonton <span className="font-semibold text-[#1F2937]">"{video?.judul}"</span> dengan membayar koin.
        </p>

        {/* Price */}
        <div className="bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#6B7280] text-sm">Harga lanjut tonton</span>
            <span className="font-bold text-[#D62839] text-lg">{video?.harga_koin} koin</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#6B7280] text-sm">Saldo kamu</span>
            <span className={`font-semibold text-sm ${hasEnough ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {userBalance} koin
            </span>
          </div>
        </div>

        {/* Not enough balance warning */}
        {!hasEnough && (
          <div className="flex items-start gap-2 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-3 py-2.5 mb-4">
            <AlertCircle size={15} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
            <p className="text-[#DC2626] text-xs">
              Saldo koin top-up tidak cukup. Perlu tambah{' '}
              <span className="font-semibold">{video?.harga_koin - userBalance} koin</span> lagi.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2.5">
          {hasEnough ? (
            <button
              id="btn-bayar-lanjutkan"
              onClick={handlePay}
              disabled={paying}
              className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {paying ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Coins size={16} />
                  Bayar & Lanjutkan
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => navigate('/wallet')}
              className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] text-white font-semibold py-3 rounded-xl transition-colors"
            >
              <Wallet size={16} />
              Top Up Koin
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full text-[#6B7280] hover:text-[#1F2937] font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            Kembali ke Daftar Video
          </button>
        </div>

        {/* Fine print */}
        <p className="text-center text-[#6B7280] text-xs mt-4">
          1 koin = Rp{koinRate.toLocaleString('id-ID')} · Kreator mendapat {creatorSplit}% dari pembayaran
        </p>
      </div>
    </div>
  )
}
