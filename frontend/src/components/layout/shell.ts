import { useOutletContext } from 'react-router-dom'

export type ShellContext = {
  openUpload: () => void
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>()
}
