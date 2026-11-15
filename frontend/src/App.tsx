import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/auth-context'
import { LibraryProvider } from './context/LibraryProvider'
import { UploadsProvider } from './context/UploadsProvider'
import AppShell from './components/layout/AppShell'
import UploadTray from './components/upload/UploadTray'
import { LogoMark, SpinnerIcon } from './components/common/icons'
import AuthPage from './pages/AuthPage'
import LibraryPage from './pages/LibraryPage'
import PlaceholderPage from './pages/PlaceholderPage'
import UploadPage from './pages/UploadPage'
import WatchPage from './pages/WatchPage'

/** Start each page at the top, as a full page load would. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4 text-ink-3" role="status">
          <LogoMark className="size-10" />
          <SpinnerIcon />
          <span className="sr-only">Loading CloudCast</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <LibraryProvider>
      <UploadsProvider>
        <ScrollToTop />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LibraryPage view="all" />} />
            <Route path="favorites" element={<LibraryPage view="favorites" />} />
            <Route path="recent" element={<LibraryPage view="recent" />} />
            <Route path="in-progress" element={<LibraryPage view="in-progress" />} />
            <Route path="processing" element={<Navigate to="/in-progress" replace />} />
            <Route path="trash" element={<PlaceholderPage title="Trash" />} />
            <Route path="settings" element={<PlaceholderPage title="Settings" />} />
          </Route>
          <Route path="upload" element={<UploadPage />} />
          <Route path="watch/:id" element={<WatchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <UploadTray />
      </UploadsProvider>
    </LibraryProvider>
  )
}

export default App
