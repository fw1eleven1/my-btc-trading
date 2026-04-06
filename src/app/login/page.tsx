'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setIsLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const inputStyle = {
    backgroundColor: '#252525',
    border: '1px solid #333333',
    color: '#ffffff',
  }

  return (
    <main
      style={{ backgroundColor: '#0f0f0f', minHeight: '100vh' }}
      className="flex items-center justify-center p-4"
    >
      <div
        style={{ backgroundColor: '#1a1a1a', border: '1px solid #252525' }}
        className="w-full max-w-md rounded-2xl p-8 space-y-6"
      >
        <div className="text-center space-y-2">
          <h1 style={{ color: '#f7a600' }} className="text-2xl font-bold">
            BTC Trading
          </h1>
          <p style={{ color: '#888888' }} className="text-sm">
            계정에 로그인하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              style={{ color: '#888888' }}
              className="text-sm block"
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              style={inputStyle}
              className="w-full px-4 py-3 rounded-md text-sm outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-600"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              style={{ color: '#888888' }}
              className="text-sm block"
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={inputStyle}
              className="w-full px-4 py-3 rounded-md text-sm outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-600"
            />
          </div>

          {error && (
            <p style={{ color: '#f87171' }} className="text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{ backgroundColor: '#f7a600', color: '#000000' }}
            className="w-full py-3 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? '처리 중...' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  )
}
