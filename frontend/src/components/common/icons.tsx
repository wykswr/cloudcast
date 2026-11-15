import type { ReactNode, SVGProps } from 'react'

type IconProps = { className?: string } & Pick<SVGProps<SVGSVGElement>, 'strokeWidth'>

/** Line icons drawn on a 24px grid; size and color come from the className (currentColor). */
function stroke(paths: ReactNode, defaultWidth = 1.8) {
  return function Icon({ className = 'size-[18px]', strokeWidth = defaultWidth }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {paths}
      </svg>
    )
  }
}

function solid(paths: ReactNode) {
  return function Icon({ className = 'size-[18px]' }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        {paths}
      </svg>
    )
  }
}

export const SearchIcon = stroke(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </>,
)
export const UploadIcon = stroke(
  <>
    <path d="M12 16V4" />
    <path d="m6 10 6-6 6 6" />
    <path d="M4 20h16" />
  </>,
  2,
)
export const UploadCloudIcon = stroke(
  <>
    <path d="M12 15V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
)
export const GridIcon = stroke(
  <>
    <rect x="3" y="4" width="7" height="7" rx="1.5" />
    <rect x="14" y="4" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>,
)
export const ListIcon = stroke(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6h1M4 12h1M4 18h1" />
  </>,
)
export const HeartIcon = stroke(
  <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
)
export function HeartFilledIcon({ className = 'size-[18px]' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  )
}
export const ClockIcon = stroke(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
)
export const RefreshIcon = stroke(
  <>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </>,
)
export const TrashIcon = stroke(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </>,
)
export const SettingsIcon = stroke(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
)
export const SignOutIcon = stroke(
  <>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5" />
    <path d="M5 12h11" />
  </>,
)
export const CloseIcon = stroke(<path d="M6 6l12 12M18 6 6 18" />, 2.2)
export const MoreIcon = solid(
  <>
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </>,
)
export const PencilIcon = stroke(<path d="M4 20h4L19 9l-4-4L4 16z" />)
export const LinkIcon = stroke(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
)
export const PlayIcon = solid(<path d="M8 5.5v13l10.5-6.5z" />)
export const PauseIcon = solid(
  <>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </>,
)
export const Back10Icon = stroke(
  <>
    <path d="M4 12a8 8 0 1 0 2.3-5.7" />
    <path d="M4 4v4h4" />
    <text
      x="12.5"
      y="15.5"
      fontSize="7"
      fontWeight="700"
      textAnchor="middle"
      fill="currentColor"
      stroke="none"
    >
      10
    </text>
  </>,
)
export const Forward10Icon = stroke(
  <>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v4h-4" />
    <text
      x="11.5"
      y="15.5"
      fontSize="7"
      fontWeight="700"
      textAnchor="middle"
      fill="currentColor"
      stroke="none"
    >
      10
    </text>
  </>,
)
export const VolumeIcon = stroke(
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </>,
)
export const MutedIcon = stroke(
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </>,
)
export const SlidersIcon = stroke(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
)
export const PipIcon = stroke(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" />
  </>,
)
export function FullscreenIcon({
  exit = false,
  className = 'size-5',
}: IconProps & { exit?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {exit ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  )
}
export const MoonIcon = stroke(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)
export const ChevronLeftIcon = stroke(<path d="m15 6-6 6 6 6" />, 2)
export const ChevronDownIcon = stroke(<path d="m6 9 6 6 6-6" />, 2)
export const CheckIcon = stroke(<path d="m5 12 5 5 9-10" />, 2.2)
export const AlertIcon = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <path d="M12 16.5v.01" />
  </>,
)
export const InfoIcon = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8v.01" />
  </>,
)
export const FilmIcon = stroke(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10 9.5v5l4-2.5z" />
  </>,
)
export const EyeIcon = stroke(
  <>
    <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" />
    <circle cx="12" cy="12" r="3" />
  </>,
)
export const EyeOffIcon = stroke(
  <>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-3.2 3.8M6.3 7.4C4.2 9 3 12 3 12s4 6 9 6a9 9 0 0 0 4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
)
export const MailIcon = stroke(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>,
)
export const LockIcon = stroke(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
)
export const CameraIcon = stroke(
  <>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="m16 10 5-3v10l-5-3" />
  </>,
)
export const ImageIcon = stroke(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </>,
)
export const PlusIcon = stroke(<path d="M12 5v14M5 12h14" />, 2.2)
export const UserIcon = stroke(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
)
export const ArrowRightIcon = stroke(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
  2,
)
export function SpinnerIcon({ className = 'size-[18px]' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      className={`animate-spin ${className}`}
      aria-hidden
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

/** The CloudCast mark: a play button on the accent square. */
export function LogoMark({ className = 'size-[30px]' }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-accent)" />
      <path d="M13 10.5v11l9-5.5z" fill="#fff" />
    </svg>
  )
}
