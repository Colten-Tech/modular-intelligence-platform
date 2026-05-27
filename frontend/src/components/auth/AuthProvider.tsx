'use client'

import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store'
import type { User } from '@/types'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAppStore((s) => s.setUser)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          plan: (session.user.user_metadata?.plan as User['plan']) ?? 'free',
          created_at: session.user.created_at,
        })
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          plan: (session.user.user_metadata?.plan as User['plan']) ?? 'free',
          created_at: session.user.created_at,
        })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, supabase])

  return <>{children}</>
}
