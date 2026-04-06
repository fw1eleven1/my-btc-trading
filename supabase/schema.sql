-- exchange_api_keys 테이블
create table exchange_api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  exchange text not null check (exchange in ('bybit', 'okx', 'binance')),
  api_key text not null,
  api_secret text not null,
  passphrase text, -- OKX 전용
  is_testnet boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, exchange)
);

-- RLS 정책
alter table exchange_api_keys enable row level security;
create policy "users can manage own api keys" on exchange_api_keys
  for all using (auth.uid() = user_id);

-- trade_history 테이블
create table trade_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  exchange text not null check (exchange in ('bybit', 'okx', 'binance')),
  side text not null check (side in ('long', 'short')),
  leverage int not null,
  entry_price numeric not null,
  amount numeric not null,
  btc_qty numeric not null,
  tp_price numeric,
  sl_price numeric,
  close_price numeric,
  order_id text,
  status text default 'open',
  exit_price numeric,
  pnl numeric,
  created_at timestamptz default now()
);

-- 이미 생성된 테이블에 컬럼 추가 시 아래 SQL 실행
-- alter table trade_history add column if not exists exit_price numeric;
-- alter table trade_history add column if not exists pnl numeric;

alter table trade_history enable row level security;
create policy "users can manage own trades" on trade_history
  for all using (auth.uid() = user_id);
