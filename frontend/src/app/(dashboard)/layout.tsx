import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { AppLayout } from '@/components/layout/AppLayout'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/auth/login')
  }

  return <AppLayout>{children}</AppLayout>
}
