-- =====================================================
-- DayCount - Supabase 建表脚本（幂等版）
-- 重复运行不会报错
-- =====================================================

-- 1. 创建 events 表（如果不存在）
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

-- 3. 创建 RLS 策略（跳过已存在的）
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'events' and policyname = 'Users can read own events'
  ) then
    create policy "Users can read own events"
      on public.events for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies 
    where tablename = 'events' and policyname = 'Users can insert own events'
  ) then
    create policy "Users can insert own events"
      on public.events for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies 
    where tablename = 'events' and policyname = 'Users can delete own events'
  ) then
    create policy "Users can delete own events"
      on public.events for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- 4. 创建索引（如果不存在）
create index if not exists idx_events_user_id
  on public.events (user_id);
