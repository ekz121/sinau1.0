import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, ShieldBan, ShieldCheck, Loader2, Search, ChevronLeft, ChevronRight, X, Trash2, ShieldPlus, ShieldMinus } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_SIZE = 15

async function adminManageUser(target_user_id, action) {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { target_user_id, action },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export default function UserManagementPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [processing, setProcessing] = useState(null) // userId yang sedang diproses
  const [selected, setSelected] = useState(null)
  const [userHistory, setUserHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    let query = supabase
      .from('profiles')
      .select('*, videos(count)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search.trim()) query = query.ilike('nama', `%${search.trim()}%`)
    if (roleFilter) query = query.eq('role', roleFilter)

    const { data, count } = await query
    setUsers(data ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [search, roleFilter, page])

  const openUser = async (account) => {
    setSelected(account)
    setHistoryLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount_koin, status, created_at')
      .eq('user_id', account.id)
      .order('created_at', { ascending: false })
      .limit(8)
    setUserHistory(data ?? [])
    setHistoryLoading(false)
  }

  const handleAction = async (userId, action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setProcessing(userId)
    try {
      await adminManageUser(userId, action)
      const actionLabels = {
        suspend:       'Akun disuspend',
        unsuspend:     'Akun diaktifkan kembali',
        soft_delete:   'Akun dihapus',
        promote_admin: 'User dipromosikan menjadi admin',
        demote_admin:  'Admin diturunkan ke mahasiswa',
      }
      toast.success(actionLabels[action] || 'Berhasil')
      fetchUsers()
      if (selected?.id === userId) setSelected(null)
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status')
    } finally {
      setProcessing(null)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1F2937]">Manajemen User</h1>
          <p className="text-[#6B7280] text-sm mt-1">{total} pengguna terdaftar</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Cari nama..."
            className="w-full pl-8 pr-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]"
          />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0) }}
          className="px-3 py-2 bg-white border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]">
          <option value="">Semua Role</option>
          <option value="mahasiswa">Mahasiswa</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array(6).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-[#6B7280] mx-auto mb-2" />
            <p className="text-[#6B7280] text-sm">Tidak ada user ditemukan</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#F1D4D6]">
              {users.map(u => (
                <div key={u.id} className="px-5 py-4 flex items-center gap-3 hover:bg-[#FAFAFA] transition-colors cursor-pointer"
                  onClick={() => openUser(u)}>
                  <div className="w-9 h-9 bg-gradient-to-br from-[#D62839] to-[#B71C2B] rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-white text-sm font-bold">{(u.nama || '?')[0].toUpperCase()}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[#1F2937] text-sm truncate">{u.nama || '(no name)'}</p>
                      {u.role === 'admin' && (
                        <span className="bg-[#FDEDEE] text-[#D62839] text-xs font-bold px-1.5 py-0.5 rounded-md">ADMIN</span>
                      )}
                      {u.is_suspended && (
                        <span className="bg-[#FEE2E2] text-[#DC2626] text-xs font-semibold px-1.5 py-0.5 rounded-md">SUSPENDED</span>
                      )}
                      {u.is_deleted && (
                        <span className="bg-[#F3F4F6] text-[#6B7280] text-xs font-semibold px-1.5 py-0.5 rounded-md">DIHAPUS</span>
                      )}
                    </div>
                    <p className="text-[#6B7280] text-xs">{u.jurusan || '-'} · {u.saldo_koin ?? 0} koin · {u.videos?.[0]?.count ?? 0} video</p>
                  </div>

                  {/* Quick action: suspend/unsuspend (hanya untuk non-admin yang belum deleted) */}
                  {u.role !== 'admin' && !u.is_deleted && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleAction(
                          u.id,
                          u.is_suspended ? 'unsuspend' : 'suspend',
                          null
                        )
                      }}
                      disabled={processing === u.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        u.is_suspended
                          ? 'bg-[#D1FAE5] text-[#059669] hover:bg-[#A7F3D0]'
                          : 'bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA]'
                      }`}
                    >
                      {processing === u.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : u.is_suspended ? (
                        <><ShieldCheck size={12} /> Aktifkan</>
                      ) : (
                        <><ShieldBan size={12} /> Suspend</>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-[#F1D4D6] flex items-center justify-between">
                <span className="text-[#6B7280] text-xs">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} dari {total}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                    className="p-1.5 rounded-lg border border-[#F1D4D6] disabled:opacity-40 hover:border-[#D62839] transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-lg border border-[#F1D4D6] disabled:opacity-40 hover:border-[#D62839] transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Detail User */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1D4D6]">
              <h2 className="font-bold text-[#1F2937]">Detail User</h2>
              <button onClick={() => setSelected(null)} className="text-[#6B7280] hover:text-[#D62839]">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-gradient-to-br from-[#D62839] to-[#B71C2B] rounded-full flex items-center justify-center overflow-hidden">
                  {selected.avatar_url ? (
                    <img src={selected.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xl font-bold">{(selected.nama || '?')[0].toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-[#1F2937]">{selected.nama || '(no name)'}</p>
                  <p className="text-[#6B7280] text-sm">{selected.jurusan || '-'}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Role</span>
                  <span className="font-medium text-[#1F2937] capitalize">{selected.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Saldo Koin</span>
                  <span className="font-medium text-[#1F2937]">{selected.saldo_koin ?? 0} koin</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Total Video</span>
                  <span className="font-medium text-[#1F2937]">{selected.videos?.[0]?.count ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Status</span>
                  <span className={`font-semibold ${selected.is_deleted ? 'text-[#6B7280]' : selected.is_suspended ? 'text-[#DC2626]' : 'text-[#059669]'}`}>
                    {selected.is_deleted ? 'Dihapus' : selected.is_suspended ? 'Suspended' : 'Aktif'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Bergabung</span>
                  <span className="font-medium text-[#1F2937]">
                    {new Date(selected.created_at).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="border-t border-[#F1D4D6] pt-3">
                <p className="font-semibold text-[#1F2937] text-sm mb-2">Riwayat Transaksi Terbaru</p>
                {historyLoading ? <div className="skeleton h-16 rounded-xl" /> : userHistory.length === 0 ? (
                  <p className="text-[#6B7280] text-xs">Belum ada transaksi</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {userHistory.map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between text-xs bg-[#FAFAFA] rounded-lg px-3 py-2">
                        <span className="text-[#1F2937] capitalize">{transaction.type} · {transaction.status || 'berhasil'}</span>
                        <span className="font-semibold text-[#6B7280]">{Number(transaction.amount_koin).toLocaleString('id-ID', { maximumFractionDigits: 2 })} koin</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions — hanya untuk user yang belum dihapus */}
              {!selected.is_deleted && (
                <div className="space-y-2 pt-1">
                  {/* Suspend / Unsuspend */}
                  {selected.role !== 'admin' && (
                    <button
                      onClick={() => handleAction(selected.id, selected.is_suspended ? 'unsuspend' : 'suspend', null)}
                      disabled={processing === selected.id}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        selected.is_suspended
                          ? 'bg-[#D1FAE5] text-[#059669] hover:bg-[#A7F3D0]'
                          : 'bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA]'
                      }`}
                    >
                      {processing === selected.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : selected.is_suspended ? (
                        <><ShieldCheck size={14} /> Aktifkan Akun</>
                      ) : (
                        <><ShieldBan size={14} /> Suspend Akun</>
                      )}
                    </button>
                  )}

                  {/* Promote / Demote Admin */}
                  {selected.role === 'mahasiswa' ? (
                    <button
                      onClick={() => handleAction(
                        selected.id,
                        'promote_admin',
                        `Promosikan "${selected.nama}" menjadi admin? Admin punya akses penuh ke seluruh platform.`
                      )}
                      disabled={processing === selected.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839] hover:text-[#D62839] transition-colors"
                    >
                      <ShieldPlus size={14} /> Jadikan Admin
                    </button>
                  ) : selected.role === 'admin' && (
                    <button
                      onClick={() => handleAction(
                        selected.id,
                        'demote_admin',
                        `Turunkan "${selected.nama}" dari admin menjadi mahasiswa biasa?`
                      )}
                      disabled={processing === selected.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-[#FEE2E2] text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                    >
                      <ShieldMinus size={14} /> Turunkan dari Admin
                    </button>
                  )}

                  {/* Soft Delete — hanya untuk non-admin */}
                  {selected.role !== 'admin' && (
                    <button
                      onClick={() => handleAction(
                        selected.id,
                        'soft_delete',
                        `Hapus akun "${selected.nama}"? User tidak bisa login lagi. Riwayat transaksi tetap ada.`
                      )}
                      disabled={processing === selected.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-[#FEE2E2] text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                    >
                      <Trash2 size={14} /> Hapus Akun
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
