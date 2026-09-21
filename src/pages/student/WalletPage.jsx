import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useWalletStore } from '../../stores/walletStore'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAppSettings } from '../../hooks/useAppSettings'
import { Coins, ArrowUpRight, ArrowDownLeft, History, Loader2, Wallet, QrCode, Banknote, X, Check, Clock, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const TOPUP_OPTIONS = [
  { koin: 10 }, { koin: 25 }, { koin: 50 }, { koin: 100 },
]

const TYPE_LABELS = {
  topup:    { label: 'Top Up', color: 'text-[#059669]', icon: ArrowDownLeft, bg: 'bg-[#D1FAE5]' },
  purchase: { label: 'Bayar Video', color: 'text-[#DC2626]', icon: ArrowUpRight, bg: 'bg-[#FEE2E2]' },
  earning:  { label: 'Pendapatan', color: 'text-[#059669]', icon: ArrowDownLeft, bg: 'bg-[#D1FAE5]' },
  payout:   { label: 'Pencairan', color: 'text-[#2563EB]', icon: ArrowUpRight, bg: 'bg-[#DBEAFE]' },
  refund:   { label: 'Pengembalian', color: 'text-[#059669]', icon: ArrowDownLeft, bg: 'bg-[#D1FAE5]' },
}

const STATUS_MAP = {
  pending: { label: 'Menunggu', color: 'bg-[#FEF3C7] text-[#D97706]', icon: Clock },
  selesai: { label: 'Selesai',  color: 'bg-[#D1FAE5] text-[#059669]', icon: Check },
  ditolak: { label: 'Ditolak',  color: 'bg-[#FEE2E2] text-[#DC2626]', icon: XCircle },
}

function formatDate(s) {
  return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function WalletPage() {
  const { profile, refreshProfile } = useAuthStore()
  const { fetchTransactions, transactions, loading, submitTopupRequest } = useWalletStore()
  const location = useLocation()

  // Bisa dinavigasi langsung ke tab tertentu (misal dari Studio Kreator)
  const [tab, setTab] = useState(location.state?.tab ?? 'topup')
  const [selectedKoin, setSelectedKoin] = useState(null)
  const [topupKey, setTopupKey] = useState(null)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [buktiFile, setBuktiFile] = useState(null)
  const [topupRequests, setTopupRequests] = useState([])
  const [showQrisZoom, setShowQrisZoom] = useState(false)
  const [payoutRequests, setPayoutRequests] = useState([])

  const [payoutForm, setPayoutForm] = useState({ jumlah_koin: '', bank: '', nomor: '', nama_pemilik: '' })
  const [payoutLoading, setPayoutLoading] = useState(false)
  const [payoutKey, setPayoutKey] = useState(null)

  // Baca settings dari DB
  const { settings } = useAppSettings(['qris_image_url', 'koin_to_rupiah_rate', 'min_payout_koin', 'min_topup_koin', 'max_topup_koin'])
  const qrisUrl = settings.qris_image_url || ''
  const koinRate = parseInt(settings.koin_to_rupiah_rate ?? '500') || 500
  const minPayout = parseInt(settings.min_payout_koin ?? '50') || 50
  const minTopup = parseInt(settings.min_topup_koin ?? '1') || 1
  const maxTopup = parseInt(settings.max_topup_koin ?? '10000') || 10000

  useEffect(() => {
    fetchTransactions()
    loadRequests()
  }, [tab])

  useEffect(() => {
    if (!profile?.id) return
    const refreshWallet = async () => {
      await refreshProfile()
      await Promise.all([fetchTransactions(), loadRequests()])
    }
    const channel = supabase
      .channel(`wallet-${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, refreshWallet)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topup_requests', filter: `user_id=eq.${profile.id}` }, refreshWallet)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests', filter: `creator_id=eq.${profile.id}` }, refreshWallet)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  async function loadRequests() {
    if (!profile?.id) return
    const [topupRes, payoutRes] = await Promise.all([
      supabase.from('topup_requests').select('*').eq('user_id', profile?.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('payout_requests').select('*').eq('creator_id', profile?.id).order('created_at', { ascending: false }).limit(20),
    ])
    setTopupRequests(topupRes.data ?? [])
    setPayoutRequests(payoutRes.data ?? [])
  }

  const submitTopup = async () => {
    if (!Number.isInteger(selectedKoin) || selectedKoin < minTopup || selectedKoin > maxTopup) {
      toast.error(`Jumlah top up harus ${minTopup}-${maxTopup} koin`)
      return
    }
    if (!buktiFile) { toast.error('Bukti transfer wajib diunggah'); return }
    setSubmitting(true)
    try {
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[buktiFile.type]
      const path = `${profile.id}/${crypto.randomUUID()}.${extension}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, buktiFile, { contentType: buktiFile.type, upsert: false })
      if (upErr) throw upErr

      const idempotencyKey = topupKey || crypto.randomUUID()
      setTopupKey(idempotencyKey)

      await submitTopupRequest({
        jumlah_koin: selectedKoin,
        bukti_transfer_url: path,
        idempotency_key: idempotencyKey,
      })

      setStep(3)
      setTopupKey(null)
      setBuktiFile(null)
      loadRequests()
    } catch (err) {
      toast.error(err.message || 'Gagal mengirim permintaan')
    } finally {
      setSubmitting(false)
    }
  }

  const submitPayout = async () => {
    const koin = parseInt(payoutForm.jumlah_koin)
    const creatorKoin = Number(profile?.saldo_koin_kreator ?? 0)
    if (!koin || koin < minPayout) { toast.error(`Minimum pencairan ${minPayout} koin`); return }
    if (!payoutForm.bank || !payoutForm.nomor || !payoutForm.nama_pemilik) {
      toast.error('Lengkapi data rekening/e-wallet'); return
    }
    if (koin > creatorKoin) {
      toast.error('Saldo Koin Pendapatan Kreator (Koin Biru) tidak cukup. Koin Top Up tidak dapat dicairkan.'); return
    }

    setPayoutLoading(true)
    try {
      const idempotencyKey = payoutKey || crypto.randomUUID()
      setPayoutKey(idempotencyKey)
      const { data, error } = await supabase.functions.invoke('request-payout', {
        body: {
          jumlah_koin: koin,
          data_tujuan: { bank: payoutForm.bank, nomor: payoutForm.nomor, nama_pemilik: payoutForm.nama_pemilik },
          idempotency_key: idempotencyKey,
        },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message)
      toast.success('Permintaan pencairan terkirim!')
      setPayoutForm({ jumlah_koin: '', bank: '', nomor: '', nama_pemilik: '' })
      setPayoutKey(null)
      await refreshProfile()
      loadRequests()
    } catch (err) {
      toast.error(err.message || 'Gagal mengirim permintaan')
    } finally {
      setPayoutLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Balance card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#111827] via-[#312E81] to-[#D62839] rounded-[1.75rem] p-6 md:p-7 text-white space-y-4 shadow-xl shadow-[#312E81]/15">
        <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border-[26px] border-white/10 pointer-events-none" />
        <div className="absolute right-20 bottom-0 h-24 w-24 rounded-full bg-[#06B6D4]/20 blur-2xl pointer-events-none" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Wallet size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white/70 text-sm">Total Saldo Koin Kamu</p>
            <p className="text-white/60 text-xs">1 koin = Rp{koinRate.toLocaleString('id-ID')}</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Coins size={28} className="text-yellow-300 mb-0.5" />
          <span className="text-4xl font-extrabold">{Number(profile?.saldo_koin ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}</span>
          <span className="text-white/70 mb-1">total koin</span>
        </div>

        {/* Coin Type Breakdown */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/20">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <p className="text-white/80 text-xs font-medium mb-1 flex items-center gap-1">
              <Coins size={12} className="text-amber-300" /> Koin Top Up
            </p>
            <p className="text-lg font-bold text-white">{Number(profile?.saldo_koin_topup ?? 0).toLocaleString('id-ID')}</p>
            <p className="text-white/60 text-[10px]">Hanya untuk akses video</p>
          </div>
          <div className="bg-blue-600/30 backdrop-blur-sm rounded-xl p-3 border border-blue-300/30">
            <p className="text-blue-100 text-xs font-semibold mb-1 flex items-center gap-1">
              <Coins size={12} className="text-blue-300" /> Koin Biru (Pendapatan)
            </p>
            <p className="text-lg font-bold text-white">{Number(profile?.saldo_koin_kreator ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}</p>
            <p className="text-blue-200/80 text-[10px]">Dapat dicairkan ke uang</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl p-1">
        {[['topup', 'Top Up'], ['payout', 'Cairkan Koin'], ['history', 'Riwayat']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === key ? 'bg-white text-[#D62839] shadow-sm' : 'text-[#6B7280] hover:text-[#1F2937]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Top Up */}
      {tab === 'topup' && (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
          {step === 1 && (
            <>
              <h2 className="font-bold text-[#1F2937] flex items-center gap-2">
                <QrCode size={18} className="text-[#D62839]" /> Top Up via QRIS
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {TOPUP_OPTIONS.map(opt => (
                  <button key={opt.koin} onClick={() => { setSelectedKoin(opt.koin); setTopupKey(null) }}
                    className={`border-2 rounded-xl p-3 text-center transition-all ${selectedKoin === opt.koin ? 'border-[#D62839] bg-[#FDEDEE]' : 'border-[#F1D4D6] hover:border-[#D62839]'}`}>
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Coins size={14} className="text-[#F59E0B]" />
                      <span className="font-bold text-[#1F2937] text-sm">{opt.koin}</span>
                    </div>
                    <p className="text-[#6B7280] text-xs">Rp{(opt.koin * koinRate).toLocaleString('id-ID')}</p>
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Atau masukkan jumlah koin</label>
                <input
                  type="number"
                  min={minTopup}
                  max={maxTopup}
                  step="1"
                  value={selectedKoin ?? ''}
                  onChange={(event) => {
                    setSelectedKoin(event.target.value === '' ? null : Number(event.target.value))
                    setTopupKey(null)
                  }}
                  placeholder={`${minTopup}-${maxTopup} koin`}
                  className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]"
                />
              </div>
              <button onClick={() => selectedKoin && setStep(2)} disabled={!selectedKoin || !qrisUrl}
                className="w-full bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
                Lanjut ke Pembayaran
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-[#1F2937]">Scan QRIS</h2>
                <button onClick={() => setStep(1)} className="text-[#6B7280] hover:text-[#D62839]"><X size={18} /></button>
              </div>
              <div className="text-center space-y-3">
                <p className="text-[#6B7280] text-sm">Transfer sebesar{' '}
                  <span className="font-bold text-[#1F2937]">Rp{(selectedKoin * koinRate).toLocaleString('id-ID')}</span>{' '}
                  untuk <span className="font-bold text-[#D62839]">{selectedKoin} koin</span>
                </p>
                {qrisUrl ? (
                  <img
                    src={qrisUrl}
                    alt="QRIS"
                    className="w-full max-w-xs mx-auto object-contain border border-[#F1D4D6] rounded-xl p-2 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setShowQrisZoom(true)}
                    title="Klik untuk perbesar"
                  />
                ) : (
                  <div className="w-56 h-56 mx-auto border-2 border-dashed border-[#F1D4D6] rounded-xl flex items-center justify-center">
                    <p className="text-[#6B7280] text-xs text-center px-4">QRIS belum diatur oleh admin</p>
                  </div>
                )}
                <p className="text-[#6B7280] text-xs">Setelah transfer, upload bukti lalu klik konfirmasi</p>
              </div>
              {/* Upload bukti */}
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Upload Bukti Transfer *</label>
                <label className="flex items-center gap-2 border border-dashed border-[#F1D4D6] hover:border-[#D62839] rounded-xl px-4 py-2.5 cursor-pointer transition-colors">
                  <span className="text-[#D62839] text-sm truncate">{buktiFile ? buktiFile.name : 'Pilih screenshot...'}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => {
                    const proof = event.target.files?.[0]
                    if (!proof) { setBuktiFile(null); return }
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(proof.type)) {
                      toast.error('Bukti harus JPG, PNG, atau WebP')
                      event.target.value = ''
                      return
                    }
                    if (proof.size > 5 * 1024 * 1024) {
                      toast.error('Ukuran bukti maksimal 5MB')
                      event.target.value = ''
                      return
                    }
                    setBuktiFile(proof)
                  }} />
                </label>
              </div>
              <button onClick={submitTopup} disabled={submitting || !buktiFile}
                className="w-full flex items-center justify-center gap-2 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Sudah Transfer, Kirim Konfirmasi
              </button>
            </>
          )}

          {step === 3 && (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 bg-[#D1FAE5] rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-[#059669]" />
              </div>
              <h3 className="font-bold text-[#1F2937]">Permintaan Terkirim!</h3>
              <p className="text-[#6B7280] text-sm">Admin akan memverifikasi pembayaran kamu. Saldo akan ditambahkan setelah disetujui.</p>
              <button onClick={() => { setStep(1); setSelectedKoin(null); setTopupKey(null) }}
                className="bg-[#D62839] text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-[#B71C2B] transition-colors">
                Top Up Lagi
              </button>
            </div>
          )}

          {/* Riwayat permintaan topup */}
          {topupRequests.length > 0 && (
            <div className="border-t border-[#F1D4D6] pt-4">
              <p className="text-sm font-semibold text-[#1F2937] mb-3">Permintaan Top Up Kamu</p>
              <div className="space-y-2">
                {topupRequests.slice(0, 5).map(r => {
                  const s = STATUS_MAP[r.status]
                  const Icon = s.icon
                  return (
                    <div key={r.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-[#1F2937]">{r.jumlah_koin} koin</span>
                        <span className="text-[#6B7280] text-xs ml-2">{formatDate(r.created_at)}</span>
                      </div>
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                        <Icon size={10} /> {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Payout */}
      {tab === 'payout' && (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 space-y-4">
          <h2 className="font-bold text-[#1F2937] flex items-center gap-2">
            <Banknote size={18} className="text-[#D62839]" /> Cairkan Koin Biru ke Uang
          </h2>
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3.5 text-xs text-[#1E40AF] leading-relaxed">
            💡 <span className="font-semibold">Informasi Payout:</span> Hanya <span className="font-bold">Koin Biru (Pendapatan Kreator)</span> yang dapat dicairkan menjadi Rupiah. Saldo Koin Biru kamu: <span className="font-bold text-[#1D4ED8]">{Number(profile?.saldo_koin_kreator ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })} koin</span>. Minimum pencairan {minPayout} koin.
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Jumlah Koin Biru yang Dicairkan</label>
              <input type="number" min={minPayout} max={profile?.saldo_koin_kreator ?? 0}
                value={payoutForm.jumlah_koin}
                onChange={e => setPayoutForm(f => ({ ...f, jumlah_koin: e.target.value }))}
                placeholder={`Min. ${minPayout} koin`}
                className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
              {payoutForm.jumlah_koin && (
                <p className="text-[#6B7280] text-xs mt-1">= Rp{(parseInt(payoutForm.jumlah_koin || 0) * koinRate).toLocaleString('id-ID')}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Bank / E-Wallet</label>
              <input type="text" value={payoutForm.bank}
                onChange={e => setPayoutForm(f => ({ ...f, bank: e.target.value }))}
                placeholder="BCA, GoPay, OVO, dll"
                className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Nomor Rekening / Akun</label>
              <input type="text" value={payoutForm.nomor}
                onChange={e => setPayoutForm(f => ({ ...f, nomor: e.target.value }))}
                placeholder="08xxxxxxxxxx atau nomor rekening"
                className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1.5">Nama Pemilik</label>
              <input type="text" value={payoutForm.nama_pemilik}
                onChange={e => setPayoutForm(f => ({ ...f, nama_pemilik: e.target.value }))}
                placeholder="Nama sesuai rekening"
                className="w-full px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
            </div>
          </div>

          <button onClick={submitPayout} disabled={payoutLoading}
            className="w-full flex items-center justify-center gap-2 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
            {payoutLoading ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
            Ajukan Pencairan
          </button>

          {/* Riwayat payout */}
          {payoutRequests.length > 0 && (
            <div className="border-t border-[#F1D4D6] pt-4">
              <p className="text-sm font-semibold text-[#1F2937] mb-3">Riwayat Pencairan</p>
              <div className="space-y-2">
                {payoutRequests.map(r => {
                  const s = STATUS_MAP[r.status]
                  const Icon = s.icon
                  return (
                    <div key={r.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-[#1F2937]">{r.jumlah_koin} koin → Rp{r.jumlah_rupiah.toLocaleString('id-ID')}</span>
                        <span className="text-[#6B7280] text-xs ml-2">{formatDate(r.created_at)}</span>
                        {r.admin_note && <p className="text-[#6B7280] text-xs">{r.admin_note}</p>}
                      </div>
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                        <Icon size={10} /> {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Riwayat */}
      {tab === 'history' && (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5">
          <h2 className="font-bold text-[#1F2937] mb-4 flex items-center gap-2">
            <History size={18} className="text-[#D62839]" /> Riwayat Transaksi
          </h2>
          {loading ? (
            <div className="space-y-3">
              {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-[#6B7280] text-sm">Belum ada transaksi</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {transactions.map(tx => {
                const meta = TYPE_LABELS[tx.type] || TYPE_LABELS.topup
                const Icon = meta.icon
                const isPositive = tx.type === 'topup' || tx.type === 'earning' || tx.type === 'refund'
                return (
                  <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#FAFAFA]">
                    <div className={`w-9 h-9 ${meta.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon size={16} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#1F2937] text-sm font-medium">{meta.label}</p>
                      <p className="text-[#6B7280] text-xs">{formatDate(tx.created_at)} · {tx.status === 'pending' ? 'Menunggu' : tx.status === 'gagal' ? 'Gagal' : 'Berhasil'}</p>
                    </div>
                    <span className={`font-bold text-sm ${isPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {isPositive ? '+' : '-'}{Number(tx.amount_koin).toLocaleString('id-ID', { maximumFractionDigits: 2 })} koin
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* QRIS Zoom Modal */}
      {showQrisZoom && qrisUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowQrisZoom(false)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowQrisZoom(false)}
              className="absolute -top-10 right-0 text-white hover:text-[#D62839] transition-colors"
            >
              <X size={24} />
            </button>
            <img src={qrisUrl} alt="QRIS" className="w-full rounded-2xl shadow-2xl" />
            <p className="text-white/70 text-center text-sm mt-3">Tap di luar gambar untuk menutup</p>
          </div>
        </div>
      )}
    </div>
  )
}
