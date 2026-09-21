const sizeClasses = {
  sm: 'h-8 w-8 rounded-xl p-1',
  md: 'h-10 w-10 rounded-xl p-1.5',
  lg: 'h-14 w-14 rounded-2xl p-2',
}

export default function BrandLogo({ size = 'sm', className = '', dark = false }) {
  const background = dark
    ? 'bg-gradient-to-br from-[#D62839] to-[#4F46E5]'
    : 'bg-gradient-to-br from-[#111827] via-[#312E81] to-[#D62839]'

  return (
    <span className={`inline-flex flex-shrink-0 items-center justify-center overflow-hidden shadow-md ${background} ${sizeClasses[size] || sizeClasses.sm} ${className}`}>
      <img
        src={`${import.meta.env.BASE_URL}sinau-logo.png`}
        alt="Logo Sinau"
        className="h-full w-full object-contain"
      />
    </span>
  )
}
