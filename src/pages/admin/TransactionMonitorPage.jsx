import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ArrowUpRight, ArrowDownLeft, Loader2, Check, X, Upload } from 'lucide-react'
import toast from 'react-hot-toast'

const TYPE_MAP = {
  topup:    { label: 'Top Up', color: 'text-[#059669]', bg: 'bg-[#D1FAE5]', icon: ArrowDownLeft },
  purchase: { label: 'Bayar Video', color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]', icon: ArrowUpRight },
  earning:  { label: 'Pendapatan Kreator', color: 'text-[#059669]', bg: 'bg-[#D1FAE5]', icon: ArrowDownLeft },
  payout:   { label: 'Pencairan', color: 'text-[#2563EB]', bg: 'bg-[#DBEAFE]', icon: ArrowUpRight },
  refund:   { label: 'Pengembalian', color: 'text-[#059669]', bg: 'bg-[#D1FAE5]', icon: ArrowDownLeft },
}

const STATUS_STYLE = {
  pending: 'bg-[#FEF3C7] text-[#D97706]',
  selesai: 'bg-[#D1FAE5] text-[#059669]',
  ditolak: 'bg-[#FEE2E2] text-[#DC2626]',
}

function formatDate(s) {
  return new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TransactionMonitorPage() {
  const [tab, setTab] = useState('log')
  const [transactions, setTransactions] = useState([])
  const [topupReqs, setTopupReqs] = useState([])
  const [payoutReqs, setPayoutReqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [payoutProofs, setPayoutProofs] = useState({})
  const [txFilter, setTxFilter] = useState('')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [txRes, topupRes, payoutRes] = await Promise.all([
        supabase.from('transactions').select('*, profiles(nama)').order('created_at', { ascending: false }).limit(100),
        supabase.from('topup_requests').select('*, profiles(nama)').order('created_at', { ascending: false }),
        supabase.from('payout_requests').select('*, profiles(nama)').order('created_at', { ascending: false }),
      ])
      const queryError = txRes.error || topupRes.error || payoutRes.error
      if (queryError) throw queryError

      setTransactions(txRes.data ?? [])
      const topupsWithProof = await Promise.all((topupRes.data ?? []).map(async (request) => {
        if (!request.bukti_transfer_url) return { ...request, proof_url: null }
        if (/^https?:\/\//.test(request.bukti_transfer_url)) return { ...request, proof_url: request.bukti_transfer_url }
        const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(request.bukti_transfer_url, 300)
        return { ...request, proof_url: error ? null : data?.signedUrl ?? null }
      }))
      setTopupReqs(topupsWithProof)
      const payoutsWithProof = await Promise.all((payoutRes.data ?? []).map(async (request) => {
        if (!request.bukti_payout_url) return { ...request, payout_proof_url: null }
        const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(request.bukti_payout_url, 300)
        return { ...request, payout_proof_url: error ? null : data?.signedUrl ?? null }
      }))
      setPayoutReqs(payoutsWithProof)
    } catch (error) {
      toast.error('Gagal memuat transaksi: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const approveTopup = async (id, action) => {
    if (action === 'selesai' && !window.confirm('Pastikan nominal pada bukti sesuai dan dana QRIS sudah benar-benar masuk. Setujui top up ini?')) return
    const note = action === 'ditolak' ? window.prompt('Alasan penolakan:') : ''
    if (action === 'ditolak' && note === null) return
    if (action === 'ditolak' && !note.trim()) {
      toast.error('Alasan penolakan wajib diisi')
      return
    }
    setProcessing(id)
    try {
      const { data, error } = await supabase.functions.invoke('admin-approve-topup', {
        body: { request_id: id, action, admin_note: note },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal memproses top up')

      toast.success(action === 'selesai' ? 'Top up disetujui ✅' : 'Top up ditolak')
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setProcessing(null)
    }
  }

  const resolvePayout = async (id, action) => {
    const proof = payoutProofs[id]
    if (action === 'selesai' && !proof) {
      toast.error('Upload bukti transfer payout terlebih dahulu')
      return
    }
    if (action === 'selesai' && !window.confirm('Pastikan uang sudah ditransfer ke rekening/e-wallet kreator. Tandai pencairan ini selesai?')) return
    const note = action === 'ditolak' ? window.prompt('Alasan penolakan:') : window.prompt('Nomor referensi/catatan transfer (opsional):')
    if (note === null) return
    if (action === 'ditolak' && !note.trim()) {
      toast.error('Alasan penolakan wajib diisi')
      return
    }
    setProcessing(id)
    let uploadedProofPath = null
    try {
      if (action === 'selesai') {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[proof.type]
        if (!extension || proof.size > 5 * 1024 * 1024) throw new Error('Bukti harus JPG/PNG/WebP maksimal 5 MB')
        uploadedProofPath = `payout/${id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('payment-proofs')
          .upload(uploadedProofPath, proof, { contentType: proof.type, upsert: false })
        if (uploadError) throw uploadError
      }
      const { data, error } = await supabase.functions.invoke('admin-resolve-payout', {
        body: { payout_id: id, action, admin_note: note, payout_proof_url: uploadedProofPath },
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Gagal memproses payout')

      toast.success(action === 'selesai' ? 'Payout diselesaikan ✅' : 'Payout ditolak, koin dikembalikan')
      setPayoutProofs(current => { const next = { ...current }; delete next[id]; return next })
      uploadedProofPath = null
      fetchAll()
    } catch (err) {
      if (uploadedProofPath) await supabase.storage.from('payment-proofs').remove([uploadedProofPath])
      toast.error(err.message)
    } finally {
      setProcessing(null)
    }
  }

  const exportCSV = () => {
    let rows = []
    let filename = 'transaksi.csv'
    if (tab === 'log') {
      filename = 'log_transaksi.csv'
      rows = [
        ['Tanggal', 'User', 'Tipe', 'Jumlah Koin'],
        ...transactions.map(t => [
          new Date(t.created_at).toISOString(),
          t.profiles?.nama || t.user_id,
          t.type,
          t.amount_koin,
        ])
      ]
    } else if (tab === 'topup') {
      filename = 'topup_requests.csv'
      rows = [
        ['Tanggal', 'User', 'Koin', 'Rupiah', 'Status'],
        ...topupReqs.map(r => [
          new Date(r.created_at).toISOString(),
          r.profiles?.nama || r.user_id,
          r.jumlah_koin,
          r.jumlah_rupiah,
          r.status,
        ])
      ]
    } else {
      filename = 'payout_requests.csv'
      rows = [
        ['Tanggal', 'User', 'Koin', 'Rupiah', 'Status'],
        ...payoutReqs.map(r => [
          new Date(r.created_at).toISOString(),
          r.profiles?.nama || r.creator_id,
          r.jumlah_koin,
          r.jumlah_rupiah,
          r.status,
        ])
      ]
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`Export ${filename} berhasil 📊`)
  }

  const pendingTopup = topupReqs.filter(r => r.status === 'pending').length
  const pendingPayout = payoutReqs.filter(r => r.status === 'pending').length
  const totalTopup = transactions.filter(t => t.type === 'topup').reduce((a, t) => a + Number(t.amount_koin), 0)
  const totalPurchase = transactions.filter(t => t.type === 'purchase').reduce((a, t) => a + Number(t.amount_koin), 0)
  const platformRevenue = transactions.filter(t => t.type === 'purchase').reduce((a, t) => a + Number(t.platform_amount_koin || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Monitor Transaksi</h1>
          <p className="text-[#6B7280] text-sm mt-0.5">Kelola log transaksi, top-up QRIS, dan pencairan koin</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 bg-white border border-[#F1D4D6] hover:border-[#D62839] text-[#1F2937] hover:text-[#D62839] font-semibold px-4 py-2 rounded-xl text-xs shadow-sm transition-all"
        >
          📥 Export CSV Data
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#F1D4D6] rounded-2xl p-4 text-center">
          <p className="text-[#6B7280] text-xs mb-1">Total Top Up</p>
          <p className="font-bold text-[#1F2937] text-lg">{totalTopup} koin</p>
        </div>
        <div className="bg-white border border-[#F1D4D6] rounded-2xl p-4 text-center">
          <p className="text-[#6B7280] text-xs mb-1">Total Pembelian</p>
          <p className="font-bold text-[#1F2937] text-lg">{totalPurchase} koin</p>
        </div>
        <div className="bg-white border border-[#F1D4D6] rounded-2xl p-4 text-center">
          <p className="text-[#6B7280] text-xs mb-1">Pendapatan Akses Video</p>
          <p className="font-bold text-[#D62839] text-lg">{platformRevenue.toLocaleString('id-ID', { maximumFractionDigits: 2 })} koin</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl p-1">
        <button onClick={() => setTab('log')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'log' ? 'bg-white text-[#D62839] shadow-sm' : 'text-[#6B7280]'}`}>
          Log Otomatis
        </button>
        <button onClick={() => setTab('topup')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all relative ${tab === 'topup' ? 'bg-white text-[#D62839] shadow-sm' : 'text-[#6B7280]'}`}>
          Permintaan Top-up
          {pendingTopup > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D62839] text-white text-[10px] rounded-full flex items-center justify-center">{pendingTopup}</span>}
        </button>
        <button onClick={() => setTab('payout')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all relative ${tab === 'payout' ? 'bg-white text-[#D62839] shadow-sm' : 'text-[#6B7280]'}`}>
          Permintaan Payout
          {pendingPayout > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D62839] text-white text-[10px] rounded-full flex items-center justify-center">{pendingPayout}</span>}
        </button>
      </div>

      {/* Tab: Log */}
      {tab === 'log' && (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#F1D4D6] flex gap-2">
            {['', 'topup', 'purchase', 'earning', 'payout', 'refund'].map(f => (
              <button key={f} onClick={() => setTxFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${txFilter === f ? 'bg-[#D62839] text-white' : 'bg-[#FAFAFA] border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839]'}`}>
                {f === '' ? 'Semua' : TYPE_MAP[f]?.label || f}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : (
            <div className="divide-y divide-[#F1D4D6]">
              {(txFilter ? transactions.filter(t => t.type === txFilter) : transactions).map(tx => {
                const meta = TYPE_MAP[tx.type] || TYPE_MAP.topup
                const Icon = meta.icon
                return (
                  <div key={tx.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className={`w-9 h-9 ${meta.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon size={15} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#1F2937] text-sm font-medium">{meta.label}</p>
                      <p className="text-[#6B7280] text-xs">{tx.profiles?.nama || 'User'} · {formatDate(tx.created_at)}</p>
                    </div>
                    <span className={`font-bold text-sm ${meta.color}`}>{tx.amount_koin} koin</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Topup Requests */}
      {tab === 'topup' && (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
          ) : topupReqs.length === 0 ? (
            <div className="text-center py-12 text-[#6B7280] text-sm">Belum ada permintaan top-up</div>
          ) : (
            <div className="divide-y divide-[#F1D4D6]">
              {topupReqs.map(r => (
                <div key={r.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1F2937] text-sm">{r.profiles?.nama || 'User'}</p>
                    <p className="text-[#6B7280] text-xs">{r.jumlah_koin} koin · Rp{r.jumlah_rupiah.toLocaleString('id-ID')} · {formatDate(r.created_at)}</p>
                    {r.proof_url && (
                      <a href={r.proof_url} target="_blank" rel="noopener noreferrer" className="text-[#D62839] text-xs font-medium hover:underline">📎 Lihat Bukti Transfer (tautan 5 menit)</a>
                    )}
                    {!r.proof_url && r.status === 'pending' && (
                      <p className="text-[#DC2626] text-xs font-medium">Bukti tidak dapat dibuka - jangan setujui sebelum diperiksa.</p>
                    )}
                    {r.admin_note && <p className="text-[#6B7280] text-xs italic">{r.admin_note}</p>}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  {r.status === 'pending' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => approveTopup(r.id, 'selesai')} disabled={processing === r.id || !r.proof_url}
                        className="flex items-center gap-1 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                        {processing === r.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Setujui & Kirim Koin
                      </button>
                      <button onClick={() => approveTopup(r.id, 'ditolak')} disabled={processing === r.id}
                        className="flex items-center gap-1 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                        <X size={11} /> Tolak
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Payout Requests */}
      {tab === 'payout' && (
        <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
          ) : payoutReqs.length === 0 ? (
            <div className="text-center py-12 text-[#6B7280] text-sm">Belum ada permintaan pencairan</div>
          ) : (
            <div className="divide-y divide-[#F1D4D6]">
              {payoutReqs.map(r => (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1F2937] text-sm">{r.profiles?.nama || 'Kreator'}</p>
                      <p className="text-[#6B7280] text-xs">{r.jumlah_koin} koin → Rp{r.jumlah_rupiah.toLocaleString('id-ID')} · {formatDate(r.created_at)}</p>
                      <p className="text-[#6B7280] text-xs mt-0.5">
                        {r.data_tujuan?.bank} · {r.data_tujuan?.nomor} · {r.data_tujuan?.nama_pemilik}
                      </p>
                      {r.admin_note && <p className="text-[#6B7280] text-xs italic mt-0.5">Referensi/catatan: {r.admin_note}</p>}
                      {r.payout_proof_url && (
                        <a href={r.payout_proof_url} target="_blank" rel="noopener noreferrer" className="text-[#2563EB] text-xs font-medium hover:underline">Lihat bukti transfer admin</a>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  </div>
                  {r.status === 'pending' && (
                    <div className="mt-3 space-y-2">
                      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#93C5FD] bg-[#EFF6FF] px-3 py-2 text-xs font-semibold text-[#1D4ED8] hover:border-[#2563EB]">
                        <Upload size={12} /> {payoutProofs[r.id]?.name || 'Upload bukti transfer *'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                            toast.error('Bukti harus JPG/PNG/WebP maksimal 5 MB')
                            event.target.value = ''
                            return
                          }
                          setPayoutProofs(current => ({ ...current, [r.id]: file }))
                        }} />
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => resolvePayout(r.id, 'selesai')} disabled={processing === r.id}
                        className="flex items-center gap-1 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                        {processing === r.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Sudah Transfer
                      </button>
                      <button onClick={() => resolvePayout(r.id, 'ditolak')} disabled={processing === r.id}
                        className="flex items-center gap-1 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                        <X size={11} /> Tolak & Refund
                      </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
