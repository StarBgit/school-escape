-- 6학년 3반 탈출: 랭킹 서버 설정
-- Supabase 대시보드 > SQL Editor에 전부 붙여 넣고 Run 하세요. 여러 번 실행해도 안전합니다.

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now()
);

create table if not exists public.scores (
  player_id uuid primary key,
  nick text not null check (char_length(nick) between 1 and 8),
  ms integer not null check (ms between 20000 and 7200000),
  hints integer not null default 0 check (hints between 0 and 20),
  updated_at timestamptz not null default now()
);

-- 표를 직접 읽거나 쓰지 못하게 막고, 아래 함수로만 접근하게 합니다.
alter table public.runs enable row level security;
alter table public.scores enable row level security;
revoke all on public.runs, public.scores from anon, authenticated;

-- 게임 시작: 서버 시각을 기록합니다.
create or replace function public.start_run()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  delete from public.runs where started_at < now() - interval '1 day';
  insert into public.runs default values returning id into new_id;
  return new_id;
end $$;

-- 탈출: 시간은 서버가 계산합니다. 한 번 쓴 run은 다시 쓸 수 없습니다.
create or replace function public.finish_run(p_run uuid, p_player uuid, p_nick text, p_hints integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  started timestamptz;
  clean_nick text;
  clean_hints integer := least(greatest(coalesce(p_hints, 0), 0), 20);
  result_ms integer;
  best_ms integer;
begin
  delete from public.runs where id = p_run returning started_at into started;
  if started is null then
    raise exception 'run_not_found';
  end if;
  result_ms := (extract(epoch from (now() - started)) * 1000)::integer + clean_hints * 30000;
  if result_ms < 20000 or result_ms > 7200000 then
    raise exception 'time_out_of_range';
  end if;
  clean_nick := left(trim(regexp_replace(coalesce(p_nick, ''), '[[:cntrl:]]', '', 'g')), 8);
  if clean_nick = '' then clean_nick := '전학생'; end if;

  insert into public.scores as s (player_id, nick, ms, hints)
  values (p_player, clean_nick, result_ms, clean_hints)
  on conflict (player_id) do update
    set nick = excluded.nick, ms = excluded.ms, hints = excluded.hints, updated_at = now()
    where excluded.ms < s.ms;

  select ms into best_ms from public.scores where player_id = p_player;
  return jsonb_build_object('ms', result_ms, 'best', best_ms, 'improved', best_ms = result_ms);
end $$;

-- 명단: 플레이어 ID는 밖으로 내보내지 않고 "내 기록인지"만 알려 줍니다.
create or replace function public.get_scores(p_player uuid)
returns table (nick text, ms integer, hints integer, me boolean)
language sql stable security definer set search_path = ''
as $$
  select s.nick, s.ms, s.hints, s.player_id = p_player
  from public.scores s
  order by s.ms asc, s.updated_at asc
  limit 10
$$;

revoke all on function public.start_run() from public;
revoke all on function public.finish_run(uuid, uuid, text, integer) from public;
revoke all on function public.get_scores(uuid) from public;
grant execute on function public.start_run() to anon, authenticated;
grant execute on function public.finish_run(uuid, uuid, text, integer) to anon, authenticated;
grant execute on function public.get_scores(uuid) to anon, authenticated;
