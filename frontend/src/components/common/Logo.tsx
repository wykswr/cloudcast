import { LogoMark } from './icons'

function Logo({ size = 'md', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className={size === 'sm' ? 'size-[26px]' : 'size-[30px]'} />
      <span
        className={`font-display font-bold tracking-[-0.01em] ${size === 'sm' ? 'text-[17px]' : 'text-[19px]'}`}
      >
        CloudCast
      </span>
    </span>
  )
}

export default Logo
