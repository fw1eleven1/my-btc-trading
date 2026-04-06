import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/Navbar'
import HistoryClient from './HistoryClient'

export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{ backgroundColor: '#0f0f0f', minHeight: '100vh' }}>
      <Navbar userEmail={user?.email} />
      <HistoryClient />
    </div>
  )
}
