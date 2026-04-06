import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BTC Trading',
  description: '비트코인 선물 자동매매 시스템',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="h-full">
      <body
        className="min-h-full"
        style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#0f0f0f' }}
      >
        {children}
      </body>
    </html>
  )
}
