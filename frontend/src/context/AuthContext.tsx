import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth'
import type { AuthUser } from '../types'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const session = await fetchAuthSession()
      if (!session.tokens) {
        setUser(null)
        return
      }
      const current = await getCurrentUser()
      setUser({
        id: current.userId,
        email: current.signInDetails?.loginId ?? current.username,
      })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setUser(null)
  }, [])

  useEffect(() => {
    const init = async () => {
      await refreshUser()
    }
    void init()
  }, [refreshUser])

  const value = useMemo(
    () => ({ user, loading, refreshUser, logout }),
    [user, loading, refreshUser, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
