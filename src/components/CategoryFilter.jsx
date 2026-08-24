import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function CategoryFilter({ selected, onChange }) {
  const [categories, setCategories] = useState([])

  useEffect(() => {
    supabase.from('categories').select('nama').order('urutan')
      .then(({ data }) => setCategories(data?.map(c => c.nama) ?? []))
  }, [])

  const all = ['Semua', ...categories]

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {all.map(cat => {
        const isSelected = selected === cat || (cat === 'Semua' && !selected)
        return (
          <button key={cat} onClick={() => onChange(cat === 'Semua' ? '' : cat)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              isSelected
                ? 'bg-[#D62839] text-white shadow-sm'
                : 'bg-[#FAFAFA] border border-[#F1D4D6] text-[#6B7280] hover:border-[#D62839] hover:text-[#D62839]'
            }`}>
            {cat}
          </button>
        )
      })}
    </div>
  )
}
