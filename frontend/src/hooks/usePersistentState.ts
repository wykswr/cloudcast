import { useCallback, useState } from 'react'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/** useState remembered in localStorage for small per-device preferences (layout, autoplay). */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback))
  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Private mode or storage full: keep it for this visit only.
      }
    },
    [key],
  )
  return [value, update] as const
}
