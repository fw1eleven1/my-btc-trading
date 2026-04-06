'use client'

import { useState, useEffect, useCallback } from 'react'

type Exchange = 'bybit' | 'okx' | 'binance'
type Side = 'long' | 'short'

interface TradeRecord {
  id: string
  exchange: Exchange
  side: Side
  leverage: number
  entry_price: number
  exit_price: number | null
  btc_qty: number
  pnl: number | null
  tp_price: number | null
  sl_price: number | null
  close_price: number | null
  order_id: string | null
  status: string
  created_at: string
}

const EXCHANGE_LABELS: Record<Exchange, string> = {
  bybit: 'ByBit',
  okx: 'OKX',
  binance: 'Binance',
}

const s = {
  card: { backgroundColor: '#1a1a1a', border: '1px solid #252525' },
  input: { backgroundColor: '#252525', border: '1px solid #333333', color: '#ffffff' },
  label: { color: '#888888' },
}

function FilterTab({
  label,
  active,
  onClick,
  color,
}: {
  label: string
  active: boolean
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      style={
        active
          ? { backgroundColor: color ?? '#f7a600', color: color ? '#ffffff' : '#000000', border: `1px solid ${color ?? '#f7a600'}` }
          : { backgroundColor: '#252525', color: '#888888', border: '1px solid #333333' }
      }
      className="px-3 py-1.5 rounded text-xs font-semibold hover:opacity-80 transition-all"
    >
      {label}
    </button>
  )
}

export default function HistoryClient() {
  const [records, setRecords] = useState<TradeRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [filterExchange, setFilterExchange] = useState<Exchange | ''>('')
  const [filterSide, setFilterSide] = useState<Side | ''>('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterExchange) params.set('exchange', filterExchange)
    if (filterSide) params.set('side', filterSide)
    if (filterFrom) params.set('from', filterFrom)
    if (filterTo) params.set('to', filterTo)

    try {
      const res = await fetch(`/api/history?${params.toString()}`)
      const json = await res.json()
      setRecords(json.data ?? [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [filterExchange, filterSide, filterFrom, filterTo])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  const fmtDate = (iso: string) => {
    const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    const y = kst.getUTCFullYear()
    const mo = String(kst.getUTCMonth() + 1).padStart(2, '0')
    const d = String(kst.getUTCDate()).padStart(2, '0')
    const h = String(kst.getUTCHours()).padStart(2, '0')
    const mi = String(kst.getUTCMinutes()).padStart(2, '0')
    return `${y}.${mo}.${d} ${h}:${mi}`
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">

      {/* 필터 */}
      <div style={s.card} className="rounded-xl p-5 space-y-4">
        <p style={s.label} className="text-xs font-medium uppercase tracking-wider">필터</p>

        <div className="flex flex-wrap gap-4">
          {/* 거래소 */}
          <div className="space-y-1.5">
            <p style={s.label} className="text-xs">거래소</p>
            <div className="flex gap-1.5">
              <FilterTab label="전체" active={filterExchange === ''} onClick={() => setFilterExchange('')} />
              <FilterTab label="ByBit" active={filterExchange === 'bybit'} onClick={() => setFilterExchange('bybit')} />
              <FilterTab label="OKX" active={filterExchange === 'okx'} onClick={() => setFilterExchange('okx')} />
              <FilterTab label="Binance" active={filterExchange === 'binance'} onClick={() => setFilterExchange('binance')} />
            </div>
          </div>

          {/* 방향 */}
          <div className="space-y-1.5">
            <p style={s.label} className="text-xs">방향</p>
            <div className="flex gap-1.5">
              <FilterTab label="전체" active={filterSide === ''} onClick={() => setFilterSide('')} />
              <FilterTab label="롱" active={filterSide === 'long'} onClick={() => setFilterSide('long')} color="#16a34a" />
              <FilterTab label="숏" active={filterSide === 'short'} onClick={() => setFilterSide('short')} color="#dc2626" />
            </div>
          </div>

          {/* 날짜 */}
          <div className="space-y-1.5">
            <p style={s.label} className="text-xs">날짜</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                style={s.input}
                className="px-3 py-1.5 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-yellow-500"
              />
              <span style={s.label} className="text-xs">~</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                style={s.input}
                className="px-3 py-1.5 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-yellow-500"
              />
              {(filterFrom || filterTo) && (
                <button
                  onClick={() => { setFilterFrom(''); setFilterTo('') }}
                  style={{ color: '#888888' }}
                  className="text-xs underline hover:opacity-80"
                >
                  초기화
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div style={s.card} className="rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <p style={s.label} className="text-sm">불러오는 중...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-white text-sm">거래 내역이 없습니다.</p>
            <p style={s.label} className="text-xs">거래를 실행하면 여기에 기록됩니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#252525', borderBottom: '1px solid #333333' }}>
                  {['거래소', '방향', '레버리지', '진입가', '종료가', '수량', 'PnL', '수익률', '날짜'].map((h) => (
                    <th
                      key={h}
                      style={{ color: '#888888' }}
                      className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const pnlPos = r.pnl !== null && r.pnl >= 0
                  const margin = (r.entry_price * r.btc_qty) / r.leverage
                  const pnlPct = r.pnl !== null && margin > 0 ? (r.pnl / margin) * 100 : null

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid #252525',
                        backgroundColor: i % 2 === 0 ? 'transparent' : '#1e1e1e',
                      }}
                      className="hover:brightness-110 transition-all"
                    >
                      {/* 거래소 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span style={{ color: '#ffffff' }} className="font-medium">
                          {EXCHANGE_LABELS[r.exchange]}
                        </span>
                      </td>

                      {/* 방향 */}
                      <td className="px-4 py-3">
                        <span
                          style={{
                            backgroundColor: r.side === 'long' ? '#16a34a' : '#dc2626',
                            color: '#ffffff',
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }}
                        >
                          {r.side === 'long' ? '롱' : '숏'}
                        </span>
                      </td>

                      {/* 레버리지 */}
                      <td className="px-4 py-3">
                        <span style={{ color: '#f7a600' }} className="font-mono font-semibold">
                          {r.leverage}x
                        </span>
                      </td>

                      {/* 진입가 */}
                      <td className="px-4 py-3">
                        <span className="text-white font-mono">${fmt(r.entry_price)}</span>
                      </td>

                      {/* 종료가 */}
                      <td className="px-4 py-3">
                        {r.exit_price != null ? (
                          <span className="text-white font-mono">${fmt(r.exit_price)}</span>
                        ) : (
                          <span style={{ color: '#555555' }}>—</span>
                        )}
                      </td>

                      {/* 수량 */}
                      <td className="px-4 py-3">
                        <span style={{ color: '#cccccc' }} className="font-mono">
                          {r.btc_qty.toFixed(4)} BTC
                        </span>
                      </td>

                      {/* PnL */}
                      <td className="px-4 py-3">
                        {r.pnl != null ? (
                          <span style={{ color: pnlPos ? '#4ade80' : '#f87171' }} className="font-mono font-semibold">
                            {pnlPos ? '+' : ''}{r.pnl.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: '#555555' }}>—</span>
                        )}
                      </td>

                      {/* 수익률 */}
                      <td className="px-4 py-3">
                        {pnlPct != null ? (
                          <span style={{ color: pnlPos ? '#4ade80' : '#f87171' }} className="font-mono">
                            {pnlPos ? '+' : ''}{pnlPct.toFixed(2)}%
                          </span>
                        ) : (
                          <span style={{ color: '#555555' }}>—</span>
                        )}
                      </td>

                      {/* 날짜 */}
                      <td className="px-4 py-3">
                        <span style={{ color: '#888888' }} className="font-mono text-xs whitespace-nowrap">
                          {fmtDate(r.created_at)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 건수 */}
        {!loading && records.length > 0 && (
          <div style={{ borderTop: '1px solid #252525' }} className="px-4 py-3">
            <p style={s.label} className="text-xs">총 {records.length}건</p>
          </div>
        )}
      </div>
    </div>
  )
}
