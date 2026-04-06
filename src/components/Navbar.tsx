'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

interface NavbarProps {
  userEmail?: string
}

const GNB_LINKS = [
  { href: '/', label: '거래' },
  { href: '/positions', label: '포지션' },
  { href: '/history', label: '히스토리' },
]

export default function Navbar({ userEmail }: NavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mountedPathname, setMountedPathname] = useState<string | null>(null)

  useEffect(() => {
    setMountedPathname(pathname)
  }, [pathname])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav
      style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #252525' }}
      className="w-full"
    >
      {/* 상단 행: 로고 + 우측 액션 */}
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-12">
        <Link href="/">
          <span style={{ color: '#f7a600' }} className="text-base font-bold tracking-tight">
            BTC Trading
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span style={{ color: '#555555' }} className="text-xs hidden sm:block truncate max-w-[160px]">
              {userEmail}
            </span>
          )}
          <Link
            href="/settings"
            style={{ color: '#888888' }}
            className="text-sm font-medium hover:text-white transition-colors"
          >
            설정
          </Link>
          <button
            onClick={handleLogout}
            style={{ color: '#888888' }}
            className="text-sm font-medium hover:text-white transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 하단 행: GNB */}
      <div
        style={{ borderTop: '1px solid #252525' }}
        className="flex"
      >
        {GNB_LINKS.map(({ href, label }) => {
          const active = mountedPathname === href
          return (
            <Link
              key={href}
              href={href}
              style={{
                color: active ? '#ffffff' : '#888888',
                borderBottom: active ? '2px solid #f7a600' : '2px solid transparent',
              }}
              className="flex-1 flex items-center justify-center py-2.5 text-sm font-medium transition-colors hover:text-white"
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
