import type { ComponentType } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { useLibrary } from '../../context/library-context'
import Avatar from '../common/Avatar'
import Logo from '../common/Logo'
import StorageMeter from '../common/StorageMeter'
import {
  ClockIcon,
  GridIcon,
  HeartIcon,
  RefreshIcon,
  SettingsIcon,
  SignOutIcon,
  TrashIcon,
  UploadIcon,
} from '../common/icons'

type NavItem = {
  to: string
  label: string
  Icon: ComponentType<{ className?: string }>
  count?: number
  highlight?: boolean
}

function SidebarLink({ to, label, Icon, count, highlight }: NavItem) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `group flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
          isActive
            ? 'bg-fill font-semibold text-ink'
            : 'font-medium text-ink-2 hover:bg-hover hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-accent' : 'text-ink-2'}>
            <Icon />
          </span>
          <span className="flex-1">{label}</span>
          {count !== undefined ? (
            <span
              className={`min-w-[22px] rounded-full px-1.5 py-px text-center text-xs font-semibold ${
                highlight && count > 0 ? 'bg-warn-soft text-warn' : 'text-ink-3'
              }`}
            >
              {count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function Sidebar() {
  const { user, logout } = useAuth()
  const { summary } = useLibrary()

  const library: NavItem[] = [
    { to: '/', label: 'All videos', Icon: GridIcon, count: summary?.total },
    { to: '/favorites', label: 'Favorites', Icon: HeartIcon, count: summary?.favorites },
    { to: '/recent', label: 'Recent', Icon: ClockIcon },
    {
      to: '/in-progress',
      label: 'In progress',
      Icon: RefreshIcon,
      count: summary?.inProgress,
      highlight: true,
    },
  ]

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-5 border-r border-line bg-panel px-4 py-5 md:flex">
      <Link to="/" className="px-2 pt-1 text-ink no-underline">
        <Logo />
      </Link>

      <Link to="/upload" className="btn btn-primary">
        <UploadIcon />
        Upload video
      </Link>

      <nav aria-label="Library" className="flex flex-col gap-0.5">
        <span className="px-2.5 pb-1.5 text-xs font-semibold text-ink-3">Library</span>
        {library.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      <nav aria-label="Manage" className="flex flex-col gap-0.5">
        <span className="px-2.5 pb-1.5 text-xs font-semibold text-ink-3">Manage</span>
        <SidebarLink to="/trash" label="Trash" Icon={TrashIcon} />
        <SidebarLink to="/settings" label="Settings" Icon={SettingsIcon} />
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <StorageMeter />
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <Avatar email={user?.email} />
          <div className="min-w-0 flex-1 text-[13px]">
            <div className="truncate font-semibold">{user?.email?.split('@')[0] ?? 'You'}</div>
            <div className="truncate text-ink-3">{user?.email ?? ''}</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="icon-btn"
            aria-label="Sign out"
            title="Sign out"
          >
            <SignOutIcon />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
