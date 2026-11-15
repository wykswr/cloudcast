import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../common/Logo'
import { ChevronLeftIcon } from '../common/icons'

type FocusLayoutProps = {
  children: ReactNode
  /** Right side of the header. */
  actions?: ReactNode
  dark?: boolean
  backTo?: string
  backLabel?: string
}

/** Full-width pages (upload, watch): a slim header with a way back to the library. */
function FocusLayout({
  children,
  actions,
  dark = false,
  backTo = '/',
  backLabel = 'Library',
}: FocusLayoutProps) {
  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-night text-night-ink' : 'bg-canvas text-ink'}`}
    >
      <header
        className={`flex flex-wrap items-center gap-3 border-b px-3 py-3 sm:px-6 ${
          dark ? 'border-[#1e2128] bg-night' : 'border-line bg-panel'
        }`}
      >
        <Link
          to={backTo}
          className={`flex h-10 items-center gap-1.5 rounded-[10px] pr-3 pl-2 text-sm font-semibold no-underline ${
            dark ? 'text-night-ink hover:bg-white/10' : 'text-ink hover:bg-hover'
          }`}
        >
          <ChevronLeftIcon />
          {backLabel}
        </Link>
        <span className={`hidden h-6 w-px sm:block ${dark ? 'bg-night-line' : 'bg-line'}`} />
        <Link
          to="/"
          className={`hidden no-underline sm:block ${dark ? 'text-night-ink' : 'text-ink'}`}
        >
          <Logo size="sm" />
        </Link>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </header>
      {children}
    </div>
  )
}

export default FocusLayout
