import { initials } from '../../utils/user'

function Avatar({
  email,
  className = 'size-[34px]',
}: {
  email?: string | null
  className?: string
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-ink text-[13px] font-semibold text-white ${className}`}
      aria-hidden
    >
      {initials(email)}
    </span>
  )
}

export default Avatar
