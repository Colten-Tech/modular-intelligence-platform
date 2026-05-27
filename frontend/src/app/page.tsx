import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export default async function RootPage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    redirect('/overview')
  } else {
    redirect('/auth/login')
  }
}
