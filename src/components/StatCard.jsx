export default function StatCard({ icon: Icon, label, value, subtitle, color = 'primary' }) {
  const colorMap = {
    primary: 'bg-[#FDEDEE] text-[#D62839]',
    success: 'bg-[#D1FAE5] text-[#059669]',
    warning: 'bg-[#FEF3C7] text-[#D97706]',
    coin: 'bg-[#FFF8E1] text-[#B45309]',
    muted: 'bg-[#F3F4F6] text-[#6B7280]',
  }

  return (
    <div className="bg-white border border-[#F1D4D6] rounded-2xl p-5 flex items-start gap-4 hover:shadow-sm transition-shadow">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[#6B7280] text-xs font-medium uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-[#1F2937] text-2xl font-bold leading-tight">{value}</p>
        {subtitle && <p className="text-[#6B7280] text-xs mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
