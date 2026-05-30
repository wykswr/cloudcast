import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/auth-context'
import { VideosProvider } from './context/VideosContext'
import AppShell from './components/layout/AppShell'
import Mascot from './components/common/Mascot'
import AuthPage from './pages/AuthPage'
import LibraryPage from './pages/LibraryPage'
import WatchPage from './pages/WatchPage'
import PlaceholderPage from './pages/PlaceholderPage'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-center text-sakura-ink-soft">
        <div>
          <Mascot className="text-7xl" />
          <p className="mt-3 text-sm">Peeking to see if it's you… 👀</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <VideosProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LibraryPage view="all" />} />
          <Route path="favorites" element={<LibraryPage view="favorites" />} />
          <Route path="recent" element={<LibraryPage view="recent" />} />
          <Route path="processing" element={<LibraryPage view="processing" />} />
          <Route path="watch/:id" element={<WatchPage />} />
          <Route path="trash" element={<PlaceholderPage title="Trash" />} />
          <Route path="settings" element={<PlaceholderPage title="Settings" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </VideosProvider>
  )
}

export default App
