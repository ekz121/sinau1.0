import { Coins } from 'lucide-react'

export default function CoinBadge({ amount, size = 'md', className = '' }) {
  const sizes = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2',
  }

  const iconSizes = { sm: 10, md: 13, lg: 16 }

  return (
    <span
      className={`inline-flex items-center font-semibold bg-[#FFF8E1] text-[#B45309] border border-[#FDE68A] rounded-full ${sizes[size]} ${className}`}
    >
      <Coins size={iconSizes[size]} className="text-[#F59E0B] flex-shrink-0" />
      {amount} koin
    </span>
  )
}
