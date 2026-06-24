-- =====================================================
-- DayCount - Supabase 建表脚本（去除 Auth 依赖版）
-- 使用客户端 device_id 替代 Supabase Auth 做数据隔离
-- =====================================================

-- 1. 创建 events 表（如果不存在）
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,        -- 存储客户端生成的 device_id
  name text not null,
  date text not null,
  time text default '',
  created_at timestamp with time zone default now()
);

-- 2. 删除旧的身份认证 RLS 策略
drop policy if exists "Users can read own events" on public.events;
drop policy if exists "Users can insert own events" on public.events;
drop policy if exists "Users can delete own events" on public.events;

-- 3. 关闭 RLS（数据过滤在应用层通过 device_id 完成）
--    个人应用使用 anon key + 应用层过滤已足够安全
alter table public.events disable row level security;

-- 4. 创建索引
create index if not exists idx_events_user_id
  on public.events (user_id);
