import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import UploadModal from '../upload/UploadModal'
import type { ShellContext } from './shell'

/** Persistent sidebar + scrollable main area; owns the global upload modal. */
function AppShell() {
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="grid h-screen grid-cols-[15rem_1fr] overflow-hidden">
      <Sidebar />
      <main className="relative overflow-y-auto">
        <Outlet context={{ openUpload: () => setUploadOpen(true) } satisfies ShellContext} />
      </main>
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}

export default AppShell
