import { BookOpen } from 'lucide-react'

export default function SummaryCard({ summaryData }) {
  if (!summaryData) return null

  const { ai_summary } = summaryData

  return (
    <div className="bg-white border border-[#F1D4D6] rounded-2xl overflow-hidden fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#D62839] to-[#B71C2B] px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
          <BookOpen size={18} className="text-white" />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">Ringkasan Materi AI</h3>
          <p className="text-white/70 text-xs">Dibuat otomatis dari video yang kamu tonton</p>
        </div>
        {summaryData.is_fallback && (
          <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
            Dari deskripsi
          </span>
        )}
      </div>

      <div className="p-5">
        {/* Summary */}
        <div>
          <h4 className="font-semibold text-[#1F2937] text-sm mb-2 flex items-center gap-2">
            📝 Ringkasan Materi
          </h4>
          <div className="text-[#4B5563] text-sm leading-relaxed bg-[#FAFAFA] rounded-xl p-4 whitespace-pre-line">
            {ai_summary || 'Ringkasan tidak tersedia.'}
          </div>
        </div>

        {/* Helpful tip */}
        <div className="mt-4 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3">
          <p className="text-[#1E40AF] text-xs leading-relaxed">
            💡 <span className="font-semibold">Tips:</span> Simpan ringkasan ini sebagai catatan belajar. Kamu bisa kembali menonton video kapan saja untuk memahami materi lebih dalam.
          </p>
        </div>
      </div>
    </div>
  )
}
