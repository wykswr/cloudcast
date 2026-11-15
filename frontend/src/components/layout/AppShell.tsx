import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import Avatar from '../common/Avatar'
import Logo from '../common/Logo'
import AccountSheet from './AccountSheet'
import MobileNav from './MobileNav'
import Sidebar from './Sidebar'

/** Library layout: sidebar on wide screens; a header and bottom tab bar on phones. */
function AppShell() {
  const { user } = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="min-w-0 flex-1 pb-[110px] md:pb-0">
        <header className="flex items-center justify-between px-4 pt-5 pb-1 md:hidden">
          <Link to="/" className="text-ink no-underline">
            <Logo size="sm" />
          </Link>
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label="Account"
            className="grid size-11 place-items-center rounded-full"
          >
            <Avatar email={user?.email} />
          </button>
        </header>
        <Outlet />
      </div>
      <MobileNav onAccount={() => setAccountOpen(true)} />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}

export default AppShell
