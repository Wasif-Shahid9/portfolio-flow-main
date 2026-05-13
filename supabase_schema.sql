-- ============================================================
-- CRYPTO SCALPING PORTFOLIO MANAGER — SUPABASE SCHEMA
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- 1. PARTNERS TABLE
-- Stores each person (Wasif, Talha, future partners)
create table if not exists partners (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  profit_share_percent decimal(5,2) not null default 100.00,
  -- e.g. Wasif = 100, Talha = 50
  -- Trader fee to Wasif = 100 - profit_share_percent
  status       text not null default 'active' check (status in ('active', 'exited')),
  exit_date    date,
  notes        text,
  created_at   timestamptz default now()
);

-- 2. LEDGER TABLE
-- Every capital movement: money IN (investment, reinvestment) and money OUT (withdrawals)
create table if not exists ledger (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid references partners(id) not null,
  type         text not null check (
                 type in (
                   'investment',       -- initial or top-up capital deposit
                   'reinvestment',     -- profit converted into capital
                   'withdraw_profit',  -- profit taken out as cash
                   'withdraw_capital'  -- original investment withdrawn
                 )
               ),
  amount       decimal(20,8) not null check (amount > 0),
  date         date not null,
  notes        text,
  created_at   timestamptz default now()
);

-- 3. TRADES TABLE
-- Each scalping trade: just date + profit/loss + notes
create table if not exists trades (
  id           uuid primary key default gen_random_uuid(),
  trade_date   date not null,
  profit_loss  decimal(20,8) not null,   -- positive = profit, negative = loss
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- 4. TRADE DISTRIBUTIONS TABLE
-- Per-trade per-partner breakdown (permanent record, never changes)
create table if not exists trade_distributions (
  id                uuid primary key default gen_random_uuid(),
  trade_id          uuid references trades(id) on delete cascade not null,
  partner_id        uuid references partners(id) not null,
  capital_snapshot  decimal(20,8) not null,  -- their capital AT TIME of this trade
  capital_ratio     decimal(12,10) not null, -- their % of total pool (e.g. 0.5 = 50%)
  gross_amount      decimal(20,8) not null,  -- capital_ratio × trade profit_loss
  partner_net       decimal(20,8) not null,  -- gross × profit_share_percent / 100
  trader_fee        decimal(20,8) not null default 0, -- gross - partner_net (goes to Wasif)
  created_at        timestamptz default now()
);

-- 5. REINVESTMENTS TABLE
-- Tracks which trade distribution was reinvested (for visual badge in trade table)
-- This links a specific reinvestment back to its trade distribution
create table if not exists reinvestments (
  id                    uuid primary key default gen_random_uuid(),
  ledger_id             uuid references ledger(id) not null,  -- the reinvestment entry
  trade_distribution_id uuid references trade_distributions(id), -- source trade (optional)
  partner_id            uuid references partners(id) not null,
  amount                decimal(20,8) not null,
  date                  date not null,
  notes                 text,
  created_at            timestamptz default now()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index if not exists idx_ledger_partner_id   on ledger(partner_id);
create index if not exists idx_ledger_type          on ledger(type);
create index if not exists idx_trades_date          on trades(trade_date desc);
create index if not exists idx_distributions_trade  on trade_distributions(trade_id);
create index if not exists idx_distributions_partner on trade_distributions(partner_id);
create index if not exists idx_reinvestments_dist   on reinvestments(trade_distribution_id);

-- ============================================================
-- DISABLE RLS (since this is a private single-user app)
-- If you later want multi-user auth, enable RLS and add policies
-- ============================================================
alter table partners           disable row level security;
alter table ledger             disable row level security;
alter table trades             disable row level security;
alter table trade_distributions disable row level security;
alter table reinvestments      disable row level security;

-- ============================================================
-- SEED DATA — Insert Wasif and Talha as initial partners
-- You can change investment amounts here to your real numbers
-- ============================================================

-- Insert Wasif (100% profit share = he keeps everything from his capital)
insert into partners (name, profit_share_percent, status)
values ('Wasif', 100.00, 'active');

-- Insert Talha (50% profit share = Wasif gets 50% as trader fee)
insert into partners (name, profit_share_percent, status)
values ('Talha', 50.00, 'active');

-- !! IMPORTANT: After running this, go to Partners page in the app
-- and add initial investments for Wasif and Talha from there.
-- OR run the inserts below with your actual amounts:
--
-- insert into ledger (partner_id, type, amount, date, notes)
-- values (
--   (select id from partners where name = 'Wasif'),
--   'investment', 1000.00, current_date, 'Initial investment'
-- );
--
-- insert into ledger (partner_id, type, amount, date, notes)
-- values (
--   (select id from partners where name = 'Talha'),
--   'investment', 500.00, current_date, 'Initial investment'
-- );
