'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBtcMarkPrice } from '@/hooks/useBtcMarkPrice';

type Exchange = 'bybit' | 'okx' | 'binance';
type Side = 'long' | 'short';

const EXCHANGE_LABELS: Record<Exchange, string> = {
	bybit: 'ByBit',
	okx: 'OKX',
	binance: 'Binance',
};

const PERCENT_PRESETS = [3, 5, 10];

interface TradingClientProps {
	registeredExchanges: Exchange[];
}

interface PricePercentState {
	enabled: boolean;
	price: string;
	percent: string;
}

// percent는 증거금 대비 수익률(%) — 실제 가격 변동 = percent / leverage
function calcPriceFromPercent(entry: number, percent: number, direction: 'above' | 'below', leverage: number): number {
	const move = percent / 100 / leverage;
	return direction === 'above' ? entry * (1 + move) : entry * (1 - move);
}

// 가격 → 증거금 대비 수익률(%) = 가격 변동% × leverage
function calcPercentFromPrice(entry: number, price: number, leverage: number): number {
	return Math.abs(((price - entry) / entry) * 100 * leverage);
}

interface Position {
	symbol: string;
	side: 'long' | 'short';
	entryPrice: number;
	notional: number;
	leverage: number;
	contracts: number;
	unrealizedPnl: number;
	percentage: number;
	marginMode: 'cross' | 'isolated';
}

interface OpenOrder {
	id: string;
	side: 'long' | 'short';
	price: number | null;
	amount: number;
	filled: number;
	remaining: number;
	type: string;
	timestamp: number | null;
}

export default function TradingClient({ registeredExchanges }: TradingClientProps) {
	const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null);
	const [balance, setBalance] = useState<number | null>(null);
	const [balanceLoading, setBalanceLoading] = useState(false);
	const [balanceError, setBalanceError] = useState<string | null>(null);

	const [positions, setPositions] = useState<Position[]>([]);
	const [positionsLoading, setPositionsLoading] = useState(false);

	const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
	const [openOrdersLoading, setOpenOrdersLoading] = useState(false);
	const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

	// 포지션 종료 감시
	const [watchingPosition, setWatchingPosition] = useState<{ exchange: Exchange; side: 'long' | 'short' } | null>(null);
	const [positionWatchRetry, setPositionWatchRetry] = useState(0);

	const [marginMode, setMarginMode] = useState<'cross' | 'isolated' | null>(null);

	const { markPrice, connected: wsConnected } = useBtcMarkPrice(selectedExchange);

	// 마크 프라이스 기반 실시간 PnL 계산
	const positionsWithPnl = useMemo(() => {
		if (!markPrice || positions.length === 0) return positions;
		return positions.map((pos) => {
			const pnl =
				pos.side === 'long' ? (markPrice - pos.entryPrice) * pos.contracts : (pos.entryPrice - markPrice) * pos.contracts;
			const margin = Math.abs(pos.notional) / pos.leverage;
			const percentage = margin > 0 ? (pnl / margin) * 100 : 0;
			return { ...pos, unrealizedPnl: pnl, percentage };
		});
	}, [positions, markPrice]);

	const [side, setSide] = useState<Side>('long');
	const [leverage, setLeverage] = useState(10);
	const [postOnly, setPostOnly] = useState(false);
	const [bbo, setBbo] = useState(false);
	const [entryPrice, setEntryPrice] = useState('');
	const [amount, setAmount] = useState('');
	const [amountPct, setAmountPct] = useState(0);

	const [tp, setTp] = useState<PricePercentState>({ enabled: false, price: '', percent: '' });
	const [sl, setSl] = useState<PricePercentState>({ enabled: false, price: '', percent: '' });
	const [close, setClose] = useState<PricePercentState>({ enabled: false, price: '', percent: '' });

	const [positionTpsl, setPositionTpsl] = useState<{
		tp: number | null;
		sl: number | null;
		close: number | null;
	} | null>(null);

	const [executing, setExecuting] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

	// 주문 체결 감지
	const [watchingOrder, setWatchingOrder] = useState<{
		orderId: string;
		exchange: Exchange;
		side: Side;
		leverage: number;
		entryPrice: number | null;
		amount: number;
	} | null>(null);
	const [orderFillStatus, setOrderFillStatus] = useState<'open' | 'filled' | 'cancelled' | 'error' | null>(null);
	const [openFill, setOpenFill] = useState<{ filled: number; remaining: number } | null>(null);

	const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
		setToast({ message, type });
		setTimeout(() => setToast(null), 4000);
	}, []);

	const fetchBalance = useCallback(async (exchange: Exchange) => {
		setBalanceLoading(true);
		setBalanceError(null);
		setBalance(null);
		try {
			const res = await fetch(`/api/trade/balance?exchange=${exchange}`);
			const json = await res.json();
			if (!res.ok) throw new Error(json.error);
			setBalance(json.balance);
		} catch (err) {
			const msg = err instanceof Error ? err.message : '잔액 조회 실패';
			setBalanceError(msg);
		} finally {
			setBalanceLoading(false);
		}
	}, []);

	const fetchPositions = useCallback(async (exchange: Exchange, silent = false) => {
		if (!silent) setPositionsLoading(true);
		try {
			const res = await fetch(`/api/trade/positions?exchange=${exchange}`);
			const json = await res.json();
			if (!res.ok) throw new Error(json.error);
			setPositions(json.positions ?? []);
		} catch {
			if (!silent) setPositions([]);
		} finally {
			if (!silent) setPositionsLoading(false);
		}
	}, []);

	const fetchOpenOrders = useCallback(async (exchange: Exchange) => {
		setOpenOrdersLoading(true);
		try {
			const res = await fetch(`/api/trade/open-orders?exchange=${exchange}`);
			const json = await res.json();
			if (!res.ok) throw new Error(json.error);
			setOpenOrders(json.orders ?? []);
		} catch {
			setOpenOrders([]);
		} finally {
			setOpenOrdersLoading(false);
		}
	}, []);

	const handleCancelOrder = useCallback(async (exchange: Exchange, orderId: string) => {
		setCancellingOrderId(orderId);
		try {
			const res = await fetch('/api/trade/cancel-order', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ exchange, orderId }),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error);
			setOpenOrders((prev) => prev.filter((o) => o.id !== orderId));
			// watchingOrder가 같은 주문이면 감시도 중단
			setWatchingOrder((prev) => (prev?.orderId === orderId ? null : prev));
			showToast('주문이 취소되었습니다.', 'info');
		} catch (err) {
			const msg = err instanceof Error ? err.message : '주문 취소 실패';
			showToast(msg, 'error');
		} finally {
			setCancellingOrderId(null);
		}
	}, [showToast]);

	const fetchMarginMode = useCallback(async (exchange: Exchange) => {
		try {
			const res = await fetch(`/api/trade/margin-mode?exchange=${exchange}`);
			const json = await res.json();
			if (!res.ok) throw new Error(json.error);
			setMarginMode(json.marginMode);
		} catch {
			setMarginMode(null);
		}
	}, []);

	const fetchLatestTpsl = useCallback(async (exchange: Exchange) => {
		try {
			const res = await fetch(`/api/history?exchange=${exchange}`);
			const json = await res.json();
			// TP/SL/Close 중 하나라도 설정된 가장 최근 기록을 찾음
			const record = (json.data ?? []).find(
				(r: { tp_price: number | null; sl_price: number | null; close_price: number | null }) =>
					r.tp_price || r.sl_price || r.close_price
			);
			if (record) {
				setPositionTpsl({
					tp: record.tp_price ?? null,
					sl: record.sl_price ?? null,
					close: record.close_price ?? null,
				});
			} else {
				setPositionTpsl(null);
			}
		} catch {
			setPositionTpsl(null);
		}
	}, []);

	const refreshAll = useCallback(
		(exchange: Exchange) => {
			fetchBalance(exchange);
			fetchPositions(exchange);
			fetchOpenOrders(exchange);
			fetchLatestTpsl(exchange);
			fetchMarginMode(exchange);
		},
		[fetchBalance, fetchPositions, fetchOpenOrders, fetchLatestTpsl, fetchMarginMode],
	);

	const refreshAllRef = useRef(refreshAll);
	useEffect(() => { refreshAllRef.current = refreshAll; }, [refreshAll]);
	const showToastRef = useRef(showToast);
	useEffect(() => { showToastRef.current = showToast; }, [showToast]);
	const fetchBalanceRef = useRef(fetchBalance);
	useEffect(() => { fetchBalanceRef.current = fetchBalance; }, [fetchBalance]);
	const fetchPositionsRef = useRef(fetchPositions);
	useEffect(() => { fetchPositionsRef.current = fetchPositions; }, [fetchPositions]);
	const fetchOpenOrdersRef = useRef(fetchOpenOrders);
	useEffect(() => { fetchOpenOrdersRef.current = fetchOpenOrders; }, [fetchOpenOrders]);

	useEffect(() => {
		setOpenOrders([]);
		setWatchingPosition(null);
		if (selectedExchange) refreshAll(selectedExchange);
	}, [selectedExchange, refreshAll]);

	// SSE 재연결 트리거
	const [sseRetry, setSseRetry] = useState(0);

	// 주문 체결 감지 — SSE
	useEffect(() => {
		if (!watchingOrder) return;

		const { orderId, exchange } = watchingOrder;
		const es = new EventSource(`/api/trade/order-fill?orderId=${orderId}&exchange=${exchange}`);

		es.onmessage = (e) => {
			const data = JSON.parse(e.data) as {
				status: 'open' | 'filled' | 'cancelled' | 'error';
				filledPrice?: number;
				filled?: number;
				remaining?: number;
			};

			if (data.status === 'filled') {
				setOrderFillStatus('filled');
				setOpenFill(null);

				// 체결가 기반으로 포지션 카드 즉시 구성
				const filledPrice = data.filledPrice ?? watchingOrder.entryPrice ?? 0;
				if (filledPrice > 0) {
					const notional = watchingOrder.amount * watchingOrder.leverage;
					const contracts = notional / filledPrice;
					setPositions((prev) => {
						const filtered = prev.filter((p) => p.side !== watchingOrder.side);
						return [...filtered, {
							symbol: 'BTC/USDT:USDT',
							side: watchingOrder.side,
							entryPrice: filledPrice,
							notional,
							leverage: watchingOrder.leverage,
							contracts,
							unrealizedPnl: 0,
							percentage: 0,
							marginMode: marginMode ?? 'cross',
						}];
					});
				}

				setWatchingOrder(null);
				// 잔액·미체결 주문 즉시 갱신, 포지션은 백그라운드 재동기
				fetchBalanceRef.current(exchange);
				fetchOpenOrdersRef.current(exchange);
				setTimeout(() => fetchPositionsRef.current(exchange), 3000);
				// 포지션 종료 감시 시작
				setWatchingPosition({ exchange, side: watchingOrder.side });
				setPositionWatchRetry(0);
				showToastRef.current('주문 체결 완료!', 'success');
				es.close();
			} else if (data.status === 'cancelled') {
				setOrderFillStatus('cancelled');
				setWatchingOrder(null);
				setOpenFill(null);
				showToastRef.current('주문이 취소되었습니다.', 'info');
				es.close();
			} else if (data.status === 'error') {
				setOrderFillStatus('error');
				setWatchingOrder(null);
				setOpenFill(null);
				es.close();
			} else if (data.status === 'open' && data.filled !== undefined) {
				setOpenFill({ filled: data.filled ?? 0, remaining: data.remaining ?? 0 });
			}
		};

		es.onerror = () => {
			// 연결 오류 시 watchingOrder를 유지한 채 3초 후 재연결
			es.close();
			setTimeout(() => setSseRetry((n) => n + 1), 3000);
		};

		return () => es.close();
	}, [watchingOrder, sseRetry]);

	// 포지션 종료 감시 — SSE
	useEffect(() => {
		if (!watchingPosition) return;

		const { exchange, side } = watchingPosition;
		const es = new EventSource(
			`/api/trade/watch-position?exchange=${exchange}&side=${side}`
		);

		es.onmessage = (e) => {
			const data = JSON.parse(e.data) as { status: 'open' | 'closed' | 'error' };

			if (data.status === 'closed') {
				setPositions((prev) => prev.filter((p) => p.side !== side));
				setWatchingPosition(null);
				fetchBalanceRef.current(exchange);
				showToastRef.current('포지션이 종료되었습니다.', 'info');
				es.close();
			} else if (data.status === 'error') {
				// 서버 에러 → 재연결
				es.close();
				setTimeout(() => setPositionWatchRetry((n) => n + 1), 5000);
			}
			// 'open'은 무시 (단순 생존 확인)
		};

		es.onerror = () => {
			es.close();
			setTimeout(() => setPositionWatchRetry((n) => n + 1), 5000);
		};

		return () => es.close();
	}, [watchingPosition, positionWatchRetry]);

	const entryNum = parseFloat(entryPrice);
	const showTpSlSection = bbo || (!isNaN(entryNum) && entryNum > 0);

	// TP direction: long→위, short→아래
	const tpDirection = side === 'long' ? 'above' : 'below';
	// SL direction: long→아래, short→위
	const slDirection = side === 'long' ? 'below' : 'above';
	// Close direction: TP와 동일
	const closeDirection = tpDirection;

	// 롱 ↔ 숏 전환 또는 레버리지 변경 시 % 기준으로 가격 재계산
	useEffect(() => {
		if (!showTpSlSection) return;
		const tpDir = side === 'long' ? 'above' : 'below';
		const slDir = side === 'long' ? 'below' : 'above';

		setTp((prev) => {
			const pct = parseFloat(prev.percent);
			if (!prev.percent || isNaN(pct)) return prev;
			return { ...prev, price: calcPriceFromPercent(entryNum, pct, tpDir, leverage).toFixed(1) };
		});
		setSl((prev) => {
			const pct = parseFloat(prev.percent);
			if (!prev.percent || isNaN(pct)) return prev;
			return { ...prev, price: calcPriceFromPercent(entryNum, pct, slDir, leverage).toFixed(1) };
		});
		setClose((prev) => {
			const pct = parseFloat(prev.percent);
			if (!prev.percent || isNaN(pct)) return prev;
			return { ...prev, price: calcPriceFromPercent(entryNum, pct, tpDir, leverage).toFixed(1) };
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [side, leverage]);

	function applyPercent(
		state: PricePercentState,
		setState: (s: PricePercentState) => void,
		percent: number,
		direction: 'above' | 'below',
	) {
		if (!showTpSlSection) return;
		if (bbo || isNaN(entryNum) || entryNum <= 0) {
			setState({ ...state, percent: String(percent), price: '' });
		} else {
			const price = calcPriceFromPercent(entryNum, percent, direction, leverage);
			setState({ ...state, percent: String(percent), price: price.toFixed(1) });
		}
	}

	function handlePercentInput(
		state: PricePercentState,
		setState: (s: PricePercentState) => void,
		val: string,
		direction: 'above' | 'below',
	) {
		const pct = parseFloat(val);
		if (bbo || isNaN(entryNum) || entryNum <= 0) {
			setState({ ...state, percent: val, price: '' });
		} else if (!isNaN(pct)) {
			const price = calcPriceFromPercent(entryNum, pct, direction, leverage);
			setState({ ...state, percent: val, price: price.toFixed(1) });
		} else {
			setState({ ...state, percent: val, price: '' });
		}
	}

	function handlePriceInput(state: PricePercentState, setState: (s: PricePercentState) => void, val: string) {
		const price = parseFloat(val);
		if (!isNaN(price) && !isNaN(entryNum) && entryNum > 0) {
			const pct = calcPercentFromPrice(entryNum, price, leverage);
			setState({ ...state, price: val, percent: pct.toFixed(2) });
		} else {
			setState({ ...state, price: val, percent: '' });
		}
	}

	const canExecute = selectedExchange !== null && (bbo || showTpSlSection) && parseFloat(amount) > 0 && leverage >= 1;

	async function handleExecute() {
		if (!canExecute || !selectedExchange) return;
		setExecuting(true);

		const tpPrice = tp.enabled && tp.price ? parseFloat(tp.price) : null;
		const slPrice = sl.enabled && sl.price ? parseFloat(sl.price) : null;
		const closePrice = close.enabled && close.price ? parseFloat(close.price) : null;
		const tpPct = tp.enabled && tp.percent ? parseFloat(tp.percent) : null;
		const slPct = sl.enabled && sl.percent ? parseFloat(sl.percent) : null;
		const closePct = close.enabled && close.percent ? parseFloat(close.percent) : null;

		try {
			const res = await fetch('/api/trade/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					exchange: selectedExchange,
					side,
					leverage,
					entryPrice: bbo ? null : entryNum,
					amount: parseFloat(amount),
					tp: tpPrice,
					sl: slPrice,
					closePrice,
					tpPct: bbo ? tpPct : null,
					slPct: bbo ? slPct : null,
					closePct: bbo ? closePct : null,
					postOnly,
					bbo,
				}),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error);
			showToast('주문 접수 완료! 체결 대기 중...', 'info');
			// 새 TP/SL/Close가 설정된 경우에만 표시 업데이트 (없으면 기존 값 유지)
			if (tpPrice || slPrice || closePrice) {
				setPositionTpsl({ tp: tpPrice, sl: slPrice, close: closePrice });
			}
			// 폼 초기화
			setEntryPrice('');
			setAmount('');
			setAmountPct(0);
			setTp({ enabled: false, price: '', percent: '' });
			setSl({ enabled: false, price: '', percent: '' });
			setClose({ enabled: false, price: '', percent: '' });
			// 체결 감지 시작
			setOrderFillStatus('open');
			setOpenFill(null);
			setWatchingOrder({
				orderId: json.orderId,
				exchange: selectedExchange,
				side,
				leverage,
				entryPrice: bbo ? null : entryNum,
				amount: parseFloat(amount),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : '거래 실행 실패';
			showToast(msg, 'error');
		} finally {
			setExecuting(false);
		}
	}

	const s = {
		card: { backgroundColor: '#1a1a1a', border: '1px solid #252525' },
		input: { backgroundColor: '#252525', border: '1px solid #333333', color: '#ffffff' },
		label: { color: '#888888' },
		accent: { color: '#f7a600' },
	};

	const toastStyle: Record<string, { bg: string; text: string; border: string }> = {
		success: { bg: '#1a3a1a', text: '#4ade80', border: '#166534' },
		error: { bg: '#3a1a1a', text: '#f87171', border: '#7f1d1d' },
		info: { bg: '#1a2a3a', text: '#60a5fa', border: '#1e3a5f' },
	};

	return (
		<div className='max-w-xl mx-auto px-4 py-8 space-y-4'>
			{/* Toast */}
			{toast && (
				<div
					style={{
						backgroundColor: toastStyle[toast.type].bg,
						color: toastStyle[toast.type].text,
						border: `1px solid ${toastStyle[toast.type].border}`,
						position: 'fixed',
						top: '24px',
						right: '24px',
						zIndex: 50,
						maxWidth: '360px',
					}}
					className='px-5 py-3 rounded-lg text-sm font-medium shadow-lg'>
					{toast.message}
				</div>
			)}

			{/* 섹션 1: 거래소 선택 */}
			<div style={s.card} className='rounded-xl p-5 space-y-3'>
				<p style={s.label} className='text-xs font-medium uppercase tracking-wider'>
					거래소
				</p>
				<div className='flex gap-2 flex-wrap'>
					{registeredExchanges.length === 0 ? (
						<p style={{ color: '#f87171' }} className='text-sm'>
							등록된 거래소가 없습니다.{' '}
							<a href='/settings' style={s.accent} className='underline'>
								API 키 설정하기
							</a>
						</p>
					) : (
						registeredExchanges.map((ex) => {
							const active = selectedExchange === ex;
							return (
								<button
									key={ex}
									onClick={() => setSelectedExchange(ex)}
									style={
										active
											? { backgroundColor: '#f7a600', color: '#000000', border: '1px solid #f7a600' }
											: { backgroundColor: '#252525', color: '#ffffff', border: '1px solid #333333' }
									}
									className='px-4 py-2 rounded-md text-sm font-medium transition-all hover:opacity-90'>
									{EXCHANGE_LABELS[ex]}
								</button>
							);
						})
					)}
				</div>

				{/* 잔액 + 마진 모드 */}
				{selectedExchange && (
					<div className='flex items-center gap-2 pt-1 flex-wrap'>
						<span style={s.label} className='text-sm'>
							USDT 잔액
						</span>
						{balanceLoading && (
							<span style={{ color: '#888888' }} className='text-sm'>
								불러오는 중...
							</span>
						)}
						{!balanceLoading && balance !== null && (
							<span className='text-white text-sm font-mono font-semibold'>
								${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
							</span>
						)}
						{!balanceLoading && balanceError && (
							<span style={{ color: '#f87171' }} className='text-sm'>
								{balanceError}
							</span>
						)}
						{marginMode && (
							<span
								style={{
									backgroundColor: marginMode === 'cross' ? '#1a2a3a' : '#2a1a2a',
									color: marginMode === 'cross' ? '#60a5fa' : '#c084fc',
									border: `1px solid ${marginMode === 'cross' ? '#1e3a5f' : '#581c87'}`,
									fontSize: '11px',
									padding: '1px 7px',
									borderRadius: '4px',
									fontWeight: 600,
								}}>
								{marginMode === 'cross' ? '교차' : '격리'}
							</span>
						)}
						{!balanceLoading && (
							<button
								onClick={() => selectedExchange && refreshAll(selectedExchange)}
								style={{ color: '#888888' }}
								className='text-xs underline hover:opacity-80'>
								새로고침
							</button>
						)}
					</div>
				)}
			</div>

			{/* 섹션 2: 포지션 설정 */}
			{selectedExchange && (
				<div style={s.card} className='rounded-xl p-5 space-y-4'>
					<p style={s.label} className='text-xs font-medium uppercase tracking-wider'>
						포지션 설정
					</p>

					{/* 롱/숏 + 레버리지 */}
					<div className='flex items-center gap-3'>
						<div className='flex rounded-md overflow-hidden border' style={{ borderColor: '#333333' }}>
							<button
								onClick={() => setSide('long')}
								style={
									side === 'long'
										? { backgroundColor: '#16a34a', color: '#ffffff' }
										: { backgroundColor: '#252525', color: '#888888' }
								}
								className='px-5 py-2 text-sm font-semibold transition-colors'>
								롱
							</button>
							<button
								onClick={() => setSide('short')}
								style={
									side === 'short'
										? { backgroundColor: '#dc2626', color: '#ffffff' }
										: { backgroundColor: '#252525', color: '#888888' }
								}
								className='px-5 py-2 text-sm font-semibold transition-colors'>
								숏
							</button>
						</div>

						<div className='flex items-center gap-2 ml-auto'>
							<span style={s.label} className='text-sm'>
								레버리지
							</span>
							<div className='flex items-center gap-1'>
								<button
									onClick={() => setLeverage((v) => Math.max(1, v - 1))}
									style={{ backgroundColor: '#252525', color: '#ffffff', border: '1px solid #333333' }}
									className='w-7 h-7 rounded text-sm font-bold hover:opacity-80'>
									−
								</button>
								<input
									type='number'
									value={leverage}
									min={1}
									max={125}
									onChange={(e) => {
										const v = parseInt(e.target.value);
										if (!isNaN(v)) setLeverage(Math.min(125, Math.max(1, v)));
									}}
									style={{ ...s.input, width: '48px', textAlign: 'center' }}
									className='h-7 rounded text-sm font-mono outline-none'
								/>
								<button
									onClick={() => setLeverage((v) => Math.min(125, v + 1))}
									style={{ backgroundColor: '#252525', color: '#ffffff', border: '1px solid #333333' }}
									className='w-7 h-7 rounded text-sm font-bold hover:opacity-80'>
									+
								</button>
								<span style={s.accent} className='text-sm font-bold'>
									x
								</span>
							</div>
						</div>
					</div>

					{/* Post Only */}
					<div className='flex items-center gap-3'>
						<button
							onClick={() => setPostOnly((v) => !v)}
							style={{
								width: '36px',
								height: '20px',
								backgroundColor: postOnly ? '#f7a600' : '#333333',
								borderRadius: '10px',
								position: 'relative',
								transition: 'background-color 0.2s',
								flexShrink: 0,
							}}>
							<span
								style={{
									position: 'absolute',
									top: '2px',
									left: postOnly ? '18px' : '2px',
									width: '16px',
									height: '16px',
									backgroundColor: '#ffffff',
									borderRadius: '50%',
									transition: 'left 0.2s',
								}}
							/>
						</button>
						<span style={{ color: postOnly ? '#ffffff' : '#888888' }} className='text-sm font-medium'>
							Post Only
						</span>
						<span style={{ color: '#555555' }} className='text-xs'>
							메이커 주문만 허용
						</span>
					</div>

					{/* BBO */}
					<div className='flex items-center gap-3'>
						<button
							onClick={() => {
								setBbo((v) => {
									if (!v) setEntryPrice('');
									return !v;
								});
							}}
							style={{
								width: '36px',
								height: '20px',
								backgroundColor: bbo ? '#f7a600' : '#333333',
								borderRadius: '10px',
								position: 'relative',
								transition: 'background-color 0.2s',
								flexShrink: 0,
							}}>
							<span
								style={{
									position: 'absolute',
									top: '2px',
									left: bbo ? '18px' : '2px',
									width: '16px',
									height: '16px',
									backgroundColor: '#ffffff',
									borderRadius: '50%',
									transition: 'left 0.2s',
								}}
							/>
						</button>
						<span style={{ color: bbo ? '#ffffff' : '#888888' }} className='text-sm font-medium'>
							BBO
						</span>
						<span style={{ color: '#555555' }} className='text-xs'>
							{side === 'long' ? '최우선 매수호가에 주문' : '최우선 매도호가에 주문'}
						</span>
					</div>

					{/* 진입가 */}
					<div className='space-y-1.5'>
						<label style={s.label} className='text-sm block'>
							진입가 (USDT)
						</label>
						<input
							type='number'
							value={entryPrice}
							disabled={bbo}
							onChange={(e) => {
								setEntryPrice(e.target.value);
								// 진입가 변경 시 TP/SL/Close 가격 초기화
								setTp((prev) => ({ ...prev, price: '', percent: '' }));
								setSl((prev) => ({ ...prev, price: '', percent: '' }));
								setClose((prev) => ({ ...prev, price: '', percent: '' }));
							}}
							placeholder={bbo ? '자동 (최우선호가)' : '예: 95000'}
							onWheel={(e) => e.currentTarget.blur()}
							style={{ ...s.input, opacity: bbo ? 0.4 : 1 }}
							className='no-spinner w-full px-4 py-2.5 rounded-md text-sm font-mono outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-600'
						/>
					</div>

					{/* 금액 */}
					<div className='space-y-2.5'>
						<label style={s.label} className='text-sm block'>
							금액 (USDT 증거금)
						</label>

						{/* 직접 입력 */}
						<div className='relative'>
							<input
								type='number'
								value={amount}
								onChange={(e) => {
									setAmount(e.target.value);
									if (balance && balance > 0) {
										const pct = (parseFloat(e.target.value) / balance) * 100;
										setAmountPct(isNaN(pct) ? 0 : Math.min(100, parseFloat(pct.toFixed(1))));
									}
								}}
								placeholder='예: 100'
								onWheel={(e) => e.currentTarget.blur()}
								style={s.input}
								className='no-spinner w-full px-4 py-2.5 rounded-md text-sm font-mono outline-none focus:ring-1 focus:ring-yellow-500 placeholder-gray-600'
							/>
							{showTpSlSection && parseFloat(amount) > 0 && (
								<span
									style={{ color: '#888888', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
									className='absolute text-xs pointer-events-none'>
									≈ {((parseFloat(amount) * leverage) / entryNum).toFixed(4)} BTC
								</span>
							)}
						</div>

						{/* % 프리셋 버튼 */}
						<div className='flex gap-2'>
							{[10, 25, 50, 100].map((pct) => (
								<button
									key={pct}
									onClick={() => {
										setAmountPct(pct);
										if (balance) setAmount(((balance * pct) / 100).toFixed(2));
									}}
									style={
										amountPct === pct
											? { backgroundColor: '#f7a600', color: '#000000', border: '1px solid #f7a600' }
											: { backgroundColor: '#252525', color: '#888888', border: '1px solid #333333' }
									}
									className='flex-1 py-1.5 rounded text-xs font-semibold hover:opacity-80 transition-all'>
									{pct}%
								</button>
							))}
						</div>

						{/* 슬라이더 + % 직접 입력 */}
						<div className='flex items-center gap-3'>
							<input
								type='range'
								min={0}
								max={100}
								step={1}
								value={Math.round(amountPct)}
								onChange={(e) => {
									const pct = parseFloat(e.target.value);
									setAmountPct(pct);
									if (balance) setAmount(((balance * pct) / 100).toFixed(2));
								}}
								className='flex-1 accent-yellow-500 h-1.5 cursor-pointer'
							/>
							<div className='flex items-center gap-1 shrink-0'>
								<input
									type='number'
									min={0}
									max={100}
									step={1}
									value={amountPct === 0 ? '' : Math.round(amountPct)}
									onChange={(e) => {
										const pct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
										setAmountPct(pct);
										if (balance) setAmount(((balance * pct) / 100).toFixed(2));
									}}
									placeholder='0'
									onWheel={(e) => e.currentTarget.blur()}
									style={{ ...s.input, width: '76px', textAlign: 'left' }}
									className='px-2 py-1  rounded text-xs font-mono outline-none focus:ring-1 focus:ring-yellow-500'
								/>
								<span style={{ color: '#888888' }} className='text-xs'>
									%
								</span>
							</div>
						</div>
					</div>

					{/* TP / SL / Close 설정 — 진입가 입력 시 표시 */}
					{showTpSlSection && (
						<>
							<div style={{ borderTop: '1px solid #2a2a2a' }} className='pt-4 space-y-3'>
								<p style={s.label} className='text-xs font-medium uppercase tracking-wider'>
									TP / SL 설정
								</p>
								<PricePercentRow
									label='TP (익절)'
									labelColor='#4ade80'
									state={tp}
									direction={tpDirection}
									onToggle={() => setTp((prev) => ({ ...prev, enabled: !prev.enabled }))}
									onPreset={(pct) => applyPercent(tp, setTp, pct, tpDirection)}
									onPercentChange={(val) => handlePercentInput(tp, setTp, val, tpDirection)}
									onPriceChange={(val) => handlePriceInput(tp, setTp, val)}
									inputStyle={s.input}
									priceDisabled={bbo}
								/>
								<PricePercentRow
									label='SL (손절)'
									labelColor='#f87171'
									state={sl}
									direction={slDirection}
									onToggle={() => setSl((prev) => ({ ...prev, enabled: !prev.enabled }))}
									onPreset={(pct) => applyPercent(sl, setSl, pct, slDirection)}
									onPercentChange={(val) => handlePercentInput(sl, setSl, val, slDirection)}
									onPriceChange={(val) => handlePriceInput(sl, setSl, val)}
									inputStyle={s.input}
									priceDisabled={bbo}
								/>
							</div>

							<div style={{ borderTop: '1px solid #2a2a2a' }} className='pt-4 space-y-3'>
								<p style={s.label} className='text-xs font-medium uppercase tracking-wider'>
									Close 설정
								</p>
								<PricePercentRow
									label='Close'
									labelColor='#f7a600'
									state={close}
									direction={closeDirection}
									onToggle={() => setClose((prev) => ({ ...prev, enabled: !prev.enabled }))}
									onPreset={(pct) => applyPercent(close, setClose, pct, closeDirection)}
									onPercentChange={(val) => handlePercentInput(close, setClose, val, closeDirection)}
									onPriceChange={(val) => handlePriceInput(close, setClose, val)}
									inputStyle={s.input}
									priceDisabled={bbo}
								/>
							</div>
						</>
					)}
				</div>
			)}

			{/* 미체결 주문 카드 */}
			{orderFillStatus === 'open' && watchingOrder && (
				<div
					style={{ backgroundColor: '#111a24', border: '1px solid #1e3a5f', borderRadius: '12px' }}
					className='p-4 space-y-3'>
					{/* 헤더 */}
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<span className='relative flex h-2.5 w-2.5 shrink-0'>
								<span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75' />
								<span className='relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500' />
							</span>
							<p style={{ color: '#60a5fa' }} className='text-xs font-semibold uppercase tracking-wide'>
								미체결 주문 대기 중
							</p>
						</div>
						<button
							onClick={async () => {
								await handleCancelOrder(watchingOrder.exchange, watchingOrder.orderId);
								setOrderFillStatus(null);
								setOpenFill(null);
							}}
							disabled={cancellingOrderId === watchingOrder.orderId}
							style={{ color: cancellingOrderId === watchingOrder.orderId ? '#555555' : '#f87171' }}
							className='text-xs font-medium hover:opacity-70 transition-opacity disabled:cursor-not-allowed'>
							{cancellingOrderId === watchingOrder.orderId ? '취소 중...' : '취소'}
						</button>
					</div>

					{/* 주문 정보 */}
					<div className='grid grid-cols-3 gap-3'>
						<div>
							<p style={{ color: '#888888' }} className='text-xs mb-1'>방향</p>
							<span
								style={{
									backgroundColor: watchingOrder.side === 'long' ? '#16a34a' : '#dc2626',
									color: '#ffffff',
									fontSize: '11px',
									padding: '2px 8px',
									borderRadius: '4px',
									fontWeight: 700,
									display: 'inline-block',
								}}>
								{watchingOrder.side === 'long' ? '롱' : '숏'}
							</span>
						</div>
						<div>
							<p style={{ color: '#888888' }} className='text-xs mb-1'>레버리지</p>
							<p style={{ color: '#f7a600' }} className='text-sm font-mono font-semibold'>
								{watchingOrder.leverage}x
							</p>
						</div>
						<div>
							<p style={{ color: '#888888' }} className='text-xs mb-1'>진입가</p>
							<p className='text-white text-sm font-mono'>
								{watchingOrder.entryPrice
									? `$${watchingOrder.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
									: 'BBO'}
							</p>
						</div>
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<div>
							<p style={{ color: '#888888' }} className='text-xs mb-1'>증거금</p>
							<p className='text-white text-sm font-mono'>
								${watchingOrder.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
							</p>
						</div>
						{openFill && (openFill.filled > 0 || openFill.remaining > 0) && (
							<div>
								<p style={{ color: '#888888' }} className='text-xs mb-1'>체결 현황</p>
								<p className='text-white text-sm font-mono'>
									{openFill.filled.toFixed(4)}{' '}
									<span style={{ color: '#555555' }}>/ {(openFill.filled + openFill.remaining).toFixed(4)} BTC</span>
								</p>
							</div>
						)}
					</div>

					<p style={{ color: '#333333' }} className='text-xs font-mono truncate'>
						{watchingOrder.orderId}
					</p>
				</div>
			)}

			{/* 섹션 2-0: 미체결 주문 */}
			{selectedExchange && (openOrdersLoading || openOrders.length > 0) && (
				<div style={s.card} className='rounded-xl p-5 space-y-3'>
					<div className='flex items-center justify-between'>
						<p style={s.label} className='text-xs font-medium uppercase tracking-wider'>미체결 주문</p>
						<button
							onClick={() => fetchOpenOrders(selectedExchange)}
							style={{ color: '#888888' }}
							className='text-xs underline hover:opacity-80'>
							새로고침
						</button>
					</div>
					{openOrdersLoading ? (
						<p style={{ color: '#888888' }} className='text-sm'>불러오는 중...</p>
					) : (
						<div className='space-y-2'>
							{openOrders.map((o) => {
								const isCancelling = cancellingOrderId === o.id;
								return (
									<div key={o.id} style={{ backgroundColor: '#252525', border: '1px solid #333333' }} className='rounded-lg p-3'>
										<div className='flex items-center justify-between'>
											<div className='flex items-center gap-2'>
												<span
													style={{
														backgroundColor: o.side === 'long' ? '#16a34a' : '#dc2626',
														color: '#ffffff',
														fontSize: '11px',
														padding: '2px 8px',
														borderRadius: '4px',
														fontWeight: 700,
													}}>
													{o.side === 'long' ? '롱' : '숏'}
												</span>
												<span style={{ color: '#888888' }} className='text-xs'>
													{o.type}
												</span>
											</div>
											<div className='flex items-center gap-3'>
												<span style={{ color: '#f7a600' }} className='text-sm font-mono font-semibold'>
													{o.price != null
														? `$${o.price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
														: '시장가'}
												</span>
												<button
													onClick={() => handleCancelOrder(selectedExchange, o.id)}
													disabled={isCancelling}
													style={{ color: isCancelling ? '#555555' : '#f87171' }}
													className='text-xs font-medium hover:opacity-70 transition-opacity disabled:cursor-not-allowed'>
													{isCancelling ? '취소 중...' : '취소'}
												</button>
											</div>
										</div>
										<div className='flex items-center justify-between mt-2'>
											<span style={{ color: '#888888' }} className='text-xs font-mono'>
												{o.amount.toFixed(4)} BTC
											</span>
											{o.filled > 0 && (
												<span style={{ color: '#60a5fa' }} className='text-xs font-mono'>
													{o.filled.toFixed(4)} 체결 / {o.remaining.toFixed(4)} 잔량
												</span>
											)}
											<span style={{ color: '#555555' }} className='text-xs font-mono truncate max-w-[100px]'>
												{o.id}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* 섹션 2-1: 보유 포지션 */}
			{selectedExchange && (positionsLoading || positions.length > 0) && (
				<div style={s.card} className='rounded-xl p-5 space-y-3'>
					{/* 헤더 */}
					<div className='flex items-center justify-between'>
						<p style={s.label} className='text-xs font-medium uppercase tracking-wider'>
							보유 포지션
						</p>
						<div className='flex items-center gap-1.5'>
							{markPrice && (
								<span style={{ color: '#888888' }} className='text-xs font-mono'>
									${markPrice.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
								</span>
							)}
							<span
								style={{
									width: '6px',
									height: '6px',
									borderRadius: '50%',
									backgroundColor: wsConnected ? '#4ade80' : '#555555',
									display: 'inline-block',
								}}
							/>
							<span style={{ color: wsConnected ? '#4ade80' : '#555555' }} className='text-xs'>
								{wsConnected ? '실시간' : '연결 중'}
							</span>
						</div>
					</div>

					{positionsLoading ? (
						<p style={{ color: '#888888' }} className='text-sm'>
							불러오는 중...
						</p>
					) : (
						<div className='space-y-2'>
							{positionsWithPnl.map((pos, i) => {
								const pnlPositive = pos.unrealizedPnl >= 0;
								return (
									<div key={i} style={{ backgroundColor: '#252525', border: '1px solid #333333' }} className='rounded-lg p-4'>
										<div className='flex items-center justify-between mb-3'>
											{/* 방향 뱃지 */}
											<div className='flex items-center gap-2'>
												<span
													style={{
														backgroundColor: pos.side === 'long' ? '#16a34a' : '#dc2626',
														color: '#ffffff',
														fontSize: '11px',
														padding: '2px 8px',
														borderRadius: '4px',
														fontWeight: 700,
													}}>
													{pos.side === 'long' ? '롱' : '숏'}
												</span>
												<span
													style={{
														backgroundColor: pos.marginMode === 'cross' ? '#1a2a3a' : '#2a1a2a',
														color: pos.marginMode === 'cross' ? '#60a5fa' : '#c084fc',
														border: `1px solid ${pos.marginMode === 'cross' ? '#1e3a5f' : '#581c87'}`,
														fontSize: '10px',
														padding: '1px 6px',
														borderRadius: '4px',
														fontWeight: 600,
													}}>
													{pos.marginMode === 'cross' ? '교차' : '격리'}
												</span>
												<span style={{ color: '#888888' }} className='text-xs font-mono'>
													BTC/USDT
												</span>
											</div>
											{/* 미실현 손익 */}
											<div className='text-right'>
												<span style={{ color: pnlPositive ? '#4ade80' : '#f87171' }} className='text-sm font-mono font-semibold'>
													{pnlPositive ? '+' : ''}
													{pos.unrealizedPnl.toFixed(2)} USDT
												</span>
												<span style={{ color: pnlPositive ? '#4ade80' : '#f87171' }} className='text-xs font-mono ml-1'>
													({pnlPositive ? '+' : ''}
													{pos.percentage.toFixed(2)}%)
												</span>
											</div>
										</div>

										<div className='grid grid-cols-3 gap-3'>
											<div>
												<p style={{ color: '#888888' }} className='text-xs mb-0.5'>
													진입가
												</p>
												<p className='text-white text-sm font-mono'>
													${pos.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
												</p>
											</div>
											<div>
												<p style={{ color: '#888888' }} className='text-xs mb-0.5'>
													진입금액
												</p>
												<p className='text-white text-sm font-mono'>
													${Math.abs(pos.notional).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
												</p>
											</div>
											<div>
												<p style={{ color: '#888888' }} className='text-xs mb-0.5'>
													레버리지
												</p>
												<p style={{ color: '#f7a600' }} className='text-sm font-mono font-semibold'>
													{pos.leverage}x
												</p>
											</div>
										</div>

										<p style={{ color: '#555555' }} className='text-xs font-mono mt-2'>
											{pos.contracts.toFixed(4)} BTC
										</p>

										{/* TP / SL / Close */}
										{positionTpsl && (positionTpsl.tp || positionTpsl.sl || positionTpsl.close) && (
											<div
												style={{ borderTop: '1px solid #333333' }}
												className='grid grid-cols-3 gap-3 mt-3 pt-3'>
												<div>
													<p style={{ color: '#888888' }} className='text-xs mb-0.5'>TP</p>
													{positionTpsl.tp ? (
														<p style={{ color: '#4ade80' }} className='text-sm font-mono'>
															${positionTpsl.tp.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
														</p>
													) : (
														<p style={{ color: '#555555' }} className='text-sm font-mono'>—</p>
													)}
												</div>
												<div>
													<p style={{ color: '#888888' }} className='text-xs mb-0.5'>SL</p>
													{positionTpsl.sl ? (
														<p style={{ color: '#f87171' }} className='text-sm font-mono'>
															${positionTpsl.sl.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
														</p>
													) : (
														<p style={{ color: '#555555' }} className='text-sm font-mono'>—</p>
													)}
												</div>
												<div>
													<p style={{ color: '#888888' }} className='text-xs mb-0.5'>Close</p>
													{positionTpsl.close ? (
														<p style={{ color: '#f7a600' }} className='text-sm font-mono'>
															${positionTpsl.close.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
														</p>
													) : (
														<p style={{ color: '#555555' }} className='text-sm font-mono'>—</p>
													)}
												</div>
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* 섹션 5: 거래 실행 */}
			{canExecute && (
				<div style={s.card} className='rounded-xl p-5 space-y-4'>
					{/* 요약 */}
					<div style={{ backgroundColor: '#252525', borderRadius: '8px' }} className='p-4 space-y-2 text-sm'>
						<SummaryRow label='거래소' value={EXCHANGE_LABELS[selectedExchange!]} />
						<SummaryRow
							label='방향'
							value={side === 'long' ? '롱 (매수)' : '숏 (매도)'}
							valueColor={side === 'long' ? '#4ade80' : '#f87171'}
						/>
						<SummaryRow label='레버리지' value={`${leverage}x`} />
						<SummaryRow label='진입가' value={bbo ? 'BBO (최우선호가 자동)' : `$${parseFloat(entryPrice).toLocaleString('en-US')}`} valueColor={bbo ? '#f7a600' : '#ffffff'} />
						<SummaryRow label='증거금' value={`$${parseFloat(amount).toLocaleString('en-US')} USDT`} />
						<SummaryRow label='포지션 크기' value={`~$${(parseFloat(amount) * leverage).toLocaleString('en-US')} USDT`} />
						{tp.enabled && tp.price && (
							<SummaryRow
								label='TP'
								value={`$${parseFloat(tp.price).toLocaleString('en-US')} (+${tp.percent}%)`}
								valueColor='#4ade80'
							/>
						)}
						{sl.enabled && sl.price && (
							<SummaryRow
								label='SL'
								value={`$${parseFloat(sl.price).toLocaleString('en-US')} (−${sl.percent}%)`}
								valueColor='#f87171'
							/>
						)}
						{close.enabled && close.price && (
							<SummaryRow label='Close' value={`$${parseFloat(close.price).toLocaleString('en-US')}`} valueColor='#f7a600' />
						)}
					</div>

					<button
						onClick={handleExecute}
						disabled={executing}
						style={
							executing
								? { backgroundColor: '#333333', color: '#666666', cursor: 'not-allowed' }
								: side === 'long'
									? { backgroundColor: '#16a34a', color: '#ffffff' }
									: { backgroundColor: '#dc2626', color: '#ffffff' }
						}
						className='w-full py-3.5 rounded-md text-sm font-bold hover:opacity-90 transition-opacity'>
						{executing ? '주문 실행 중...' : `${side === 'long' ? '롱' : '숏'} 포지션 진입`}
					</button>
				</div>
			)}
		</div>
	);
}

// 서브 컴포넌트: TP/SL/Close 행
interface PricePercentRowProps {
	label: string;
	labelColor: string;
	state: PricePercentState;
	direction: 'above' | 'below';
	onToggle: () => void;
	onPreset: (pct: number) => void;
	onPercentChange: (val: string) => void;
	onPriceChange: (val: string) => void;
	inputStyle: React.CSSProperties;
	priceDisabled?: boolean;
}

function PricePercentRow({
	label,
	labelColor,
	state,
	onToggle,
	onPreset,
	onPercentChange,
	onPriceChange,
	inputStyle,
	priceDisabled = false,
}: PricePercentRowProps) {
	return (
		<div className='space-y-2'>
			<div className='flex items-center gap-3'>
				<button
					onClick={onToggle}
					style={{
						width: '36px',
						height: '20px',
						backgroundColor: state.enabled ? '#f7a600' : '#333333',
						borderRadius: '10px',
						position: 'relative',
						transition: 'background-color 0.2s',
						flexShrink: 0,
					}}>
					<span
						style={{
							position: 'absolute',
							top: '2px',
							left: state.enabled ? '18px' : '2px',
							width: '16px',
							height: '16px',
							backgroundColor: '#ffffff',
							borderRadius: '50%',
							transition: 'left 0.2s',
						}}
					/>
				</button>
				<span style={{ color: labelColor }} className='text-sm font-semibold'>
					{label}
				</span>
			</div>

			{state.enabled && (
				<div className='flex items-center gap-2 flex-wrap pl-12'>
					{/* % 프리셋 버튼 */}
					{PERCENT_PRESETS.map((pct) => (
						<button
							key={pct}
							onClick={() => onPreset(pct)}
							style={
								state.percent === String(pct)
									? { backgroundColor: '#f7a600', color: '#000000', border: '1px solid #f7a600' }
									: { backgroundColor: '#252525', color: '#888888', border: '1px solid #333333' }
							}
							className='px-3 py-1 rounded text-xs font-medium hover:opacity-80 transition-all'>
							{pct}%
						</button>
					))}

					{/* 직접 % 입력 */}
					<div className='flex items-center gap-1'>
						<input
							type='number'
							value={state.percent}
							onChange={(e) => onPercentChange(e.target.value)}
							placeholder='0.00'
							style={{ ...inputStyle, width: '64px', textAlign: 'right' }}
							className='px-2 py-1 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-yellow-500'
						/>
						<span style={{ color: '#888888' }} className='text-xs'>
							%
						</span>
					</div>

					{priceDisabled ? (
						<span style={{ color: '#555555' }} className='text-xs'>BBO 체결 후 계산</span>
					) : (
						<>
							<span style={{ color: '#555555' }} className='text-xs'>→</span>
							{/* 직접 가격 입력 */}
							<div className='flex items-center gap-1'>
								<span style={{ color: '#888888' }} className='text-xs'>$</span>
								<input
									type='number'
									value={state.price}
									onChange={(e) => onPriceChange(e.target.value)}
									placeholder='가격'
									style={{ ...inputStyle, width: '100px' }}
									className='px-2 py-1 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-yellow-500'
								/>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}

function SummaryRow({ label, value, valueColor = '#ffffff' }: { label: string; value: string; valueColor?: string }) {
	return (
		<div className='flex justify-between items-center'>
			<span style={{ color: '#888888' }}>{label}</span>
			<span style={{ color: valueColor }} className='font-medium font-mono'>
				{value}
			</span>
		</div>
	);
}
