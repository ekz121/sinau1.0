import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, GripVertical, Loader2, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CategoryManagePage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('urutan')
    setCategories(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCategories() }, [])

  const addCategory = async () => {
    if (!newName.trim()) return
    setAdding(true)
    const maxUrutan = categories.length > 0 ? Math.max(...categories.map(c => c.urutan)) + 1 : 1
    const { error } = await supabase.from('categories').insert({ nama: newName.trim(), urutan: maxUrutan })
    if (error) {
      toast.error(error.message.includes('unique') ? 'Kategori sudah ada' : error.message)
    } else {
      toast.success('Kategori ditambahkan')
      setNewName('')
      fetchCategories()
    }
    setAdding(false)
  }

  const deleteCategory = async (id, nama) => {
    if (!window.confirm(`Hapus kategori "${nama}"? Video dengan kategori ini tidak akan terpengaruh.`)) return
    setDeleting(id)
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) toast.error('Gagal menghapus: ' + error.message)
    else { toast.success('Kategori dihapus'); fetchCategories() }
    setDeleting(null)
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1F2937]">Manajemen Kategori</h1>
        <p className="text-[#6B7280] text-sm mt-1">Kelola kategori/mata kuliah yang tersedia di platform</p>
      </div>

      {/* Add */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5">
        <p className="font-semibold text-[#1F2937] text-sm mb-3">Tambah Kategori Baru</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="Nama kategori..."
            className="flex-1 px-4 py-2.5 border border-[#F1D4D6] rounded-xl text-sm focus:outline-none focus:border-[#D62839]" />
          <button onClick={addCategory} disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 bg-[#D62839] hover:bg-[#B71C2B] disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Tambah
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#F1D4D6]">
          <p className="font-semibold text-[#1F2937] text-sm">{categories.length} kategori</p>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : categories.length === 0 ? (
          <p className="text-center text-[#6B7280] text-sm py-8">Belum ada kategori</p>
        ) : (
          <div className="divide-y divide-[#F1D4D6]">
            {categories.map(cat => (
              <div key={cat.id} className="px-5 py-3.5 flex items-center gap-3">
                <GripVertical size={16} className="text-[#F1D4D6] flex-shrink-0" />
                <span className="flex-1 font-medium text-[#1F2937] text-sm">{cat.nama}</span>
                <button onClick={() => deleteCategory(cat.id, cat.nama)} disabled={deleting === cat.id}
                  className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#6B7280] hover:text-[#DC2626] transition-colors">
                  {deleting === cat.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
