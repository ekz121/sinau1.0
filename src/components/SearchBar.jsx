import { useState } from 'react'
import { Search, X } from 'lucide-react'

export default function SearchBar({ value, onChange, onClear, placeholder = 'Cari video...' }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2.5 bg-[#FAFAFA] border border-[#F1D4D6] rounded-xl text-sm text-[#1F2937] placeholder:text-[#6B7280] focus:outline-none focus:border-[#D62839] focus:bg-white transition-all"
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#D62839]"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
