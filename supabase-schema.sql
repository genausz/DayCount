-- =====================================================
-- DayCount - Supabase 建表脚本
-- 在 Supabase Dashboard → SQL Editor 中运行
-- =====================================================

-- 1. 创建 events 表
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  date text not null,
  time text default '',
  created_at timestamp with time zone default now()
);

-- 2. 开启行级安全（RLS）
alter table public.events enable row level security;

-- 3. 创建 RLS 策略：用户只能读写自己的事件

-- 查询：只能看自己的
create policy "Users can read own events"
  on public.events for select
  using (auth.uid() = user_id);

-- 插入：只能插入自己的
create policy "Users can insert own events"
  on public.events for insert
  with check (auth.uid() = user_id);

-- 删除：只能删自己的
create policy "Users can delete own events"
  on public.events for delete
  using (auth.uid() = user_id);

-- 4. 创建索引（可选，数据量大时加速）
create index if not exists idx_events_user_id
  on public.events (user_id);
