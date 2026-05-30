import { createContext, use } from 'react'
import type { AuthUser } from '../types'

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
