import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { useVideos } from '../../context/videos-context'
import { formatBytes } from '../../utils/format'
import { isInFlight } from '../../utils/status'

const STORAGE_QUOTA_BYTES = 20 * 1024 ** 3 // 20 GB

type NavItem = {
  to: string
  icon: string
  label: string
  count?: number
}

function navClass({ isActive }: { isActive: boolean }) {
  return `sk-nav ${isActive ? 'sk-nav-active' : ''}`
}

function Sidebar() {
  const { user, logout } = useAuth()
  const { videos } = useVideos()

  const favorites = videos.filter((v) => v.favorite).length
  const processing = videos.filter(isInFlight).length
  const used = videos.reduce((sum, v) => sum + (v.sizeBytes ?? 0), 0)
  const usedPct = Math.min(100, Math.round((used / STORAGE_QUOTA_BYTES) * 100))

  const libraryItems: NavItem[] = [
    { to: '/', icon: '🎬', label: 'All clips', count: videos.length },
    { to: '/favorites', icon: '♡', label: 'Favorites', count: favorites },
    { to: '/recent', icon: '🕑', label: 'Recent' },
    { to: '/processing', icon: '🍳', label: 'Processing', count: processing },
  ]

  return (
    <aside className="flex w-60 flex-col gap-1.5 border-r border-[#ffe3ee] bg-white p-5">
      <div className="flex items-center gap-3 px-2 pb-4 pt-1">
        <div
          className="grid size-11 place-items-center rounded-2xl text-[22px]"
          style={{
            background: 'linear-gradient(150deg,#ff8fb1,#a78bfa)',
            boxShadow: '0 8px 18px rgba(255,93,143,0.35)',
          }}
        >
          ☁️
        </div>
        <div>
          <b
            className="font-display text-lg font-extrabold"
            style={{
              background: 'linear-gradient(90deg,#ff5d8f,#a78bfa)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            CloudCast
          </b>
          <small className="block text-[10px] text-sakura-ink-soft">safe &amp; sparkly ✨</small>
        </div>
      </div>

      <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[1.5px] text-[#cbb6c9]">
        Library
      </p>
      {libraryItems.map((item) => (
        <NavLink key={item.to} to={item.to} end className={navClass}>
          <span className="w-5 text-center text-[17px]">{item.icon}</span>
          {item.label}
          {item.count !== undefined && (
            <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] text-sakura-ink-soft shadow-[0_2px_6px_rgba(167,139,250,0.18)]">
              {item.count}
            </span>
          )}
        </NavLink>
      ))}

      <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#cbb6c9]">
        Other
      </p>
      <NavLink to="/trash" className={navClass}>
        <span className="w-5 text-center text-[17px]">🗑️</span> Trash
      </NavLink>
      <NavLink to="/settings" className={navClass}>
        <span className="w-5 text-center text-[17px]">⚙️</span> Settings
      </NavLink>

      <div
        className="mt-auto rounded-[18px] p-3.5"
        style={{ background: 'linear-gradient(160deg,#fff0f6,#f1e9ff)' }}
      >
        <div className="mb-2 flex justify-between text-xs text-sakura-ink-soft">
          <span>Storage</span>
          <b className="text-sakura-ink">{formatBytes(used)} / 20 GB</b>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#ffe1ea]">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${usedPct}%`,
              background: 'linear-gradient(90deg,#ff8fb1,#a78bfa)',
            }}
          />
        </div>
        <small className="mt-2 block text-[11px] text-sakura-ink-soft">
          Plenty of room for more clips ♡
        </small>
      </div>

      <div className="mt-3 flex items-center gap-2.5 rounded-2xl p-2">
        <div
          className="grid size-8 place-items-center rounded-full text-base"
          style={{ background: 'linear-gradient(150deg,#7dd3fc,#a78bfa)' }}
        >
          🌸
        </div>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[13px]">{user?.email?.split('@')[0] ?? 'You'}</b>
          <small className="block truncate text-[11px] text-sakura-ink-soft">
            {user?.email ?? user?.id}
          </small>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="rounded-lg px-1.5 py-1 text-base text-sakura-ink-soft hover:bg-[#fff3f8]"
        >
          ⏏
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
