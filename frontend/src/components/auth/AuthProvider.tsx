'use client'

import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store'
import type { User } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function fetchDbUser(token: string): Promise<Partial<User>> {
  try {
    const res = await fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAppStore((s) => s.setUser)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    async function loadUser(sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown>; created_at: string }, token: string) {
      const dbUser = await fetchDbUser(token)
      setUser({
        id: sessionUser.id,
        email: sessionUser.email ?? '',
        plan: (dbUser.plan ?? (sessionUser.user_metadata?.plan as User['plan'])) ?? 'free',
        is_admin: dbUser.is_admin ?? false,
        created_at: sessionUser.created_at,
      })
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && session.access_token) {
        loadUser(session.user, session.access_token)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && session.access_token) {
        loadUser(session.user, session.access_token)
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, supabase])

  return <>{children}</>
}
