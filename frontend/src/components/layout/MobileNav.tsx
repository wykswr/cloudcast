import { Link, NavLink } from 'react-router-dom'
import { GridIcon, PlusIcon, UserIcon } from '../common/icons'

/** Bottom tab bar on phones: library, a big upload button, and account. */
function MobileNav({ onAccount }: { onAccount: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[84px] items-center justify-between border-t border-line bg-panel/95 px-7 pb-[max(18px,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `flex w-[72px] flex-col items-center gap-1 text-[11px] font-semibold no-underline ${
            isActive ? 'text-accent' : 'text-ink-2'
          }`
        }
      >
        <GridIcon className="size-[22px]" />
        Library
      </NavLink>
      <Link
        to="/upload"
        aria-label="Upload video"
        className="-mt-6 grid size-14 place-items-center rounded-[18px] bg-accent text-white shadow-[0_10px_24px_rgba(43,75,238,0.4)]"
      >
        <PlusIcon className="size-6" />
      </Link>
      <button
        type="button"
        onClick={onAccount}
        className="flex w-[72px] flex-col items-center gap-1 text-[11px] font-semibold text-ink-2"
      >
        <UserIcon className="size-[22px]" />
        Account
      </button>
    </nav>
  )
}

export default MobileNav
