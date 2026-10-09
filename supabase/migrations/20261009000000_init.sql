-- Pickleball Elo schema.
--
-- Ratings are not stored: every client replays completed matches through the
-- Elo engine (src/lib/elo), so ratings can never drift out of sync with history.
-- Anyone can read everything; only users listed in `referees` can write.

-- ─── Players ────────────────────────────────────────────────────────────────

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 40),
  nickname text check (nickname is null or length(nickname) <= 40),
  initial_singles double precision not null default 1500 check (initial_singles between 100 and 4000),
  initial_doubles double precision not null default 1500 check (initial_doubles between 100 and 4000),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Referees ───────────────────────────────────────────────────────────────

create table public.referees (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Referee',
  created_at timestamptz not null default now()
);

create function public.is_referee() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.referees where user_id = (select auth.uid()));
$$;

-- ─── Settings ───────────────────────────────────────────────────────────────

create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  group_name text not null default 'Pickleball Elo',
  -- Partial EloConfig; missing keys fall back to DEFAULT_ELO_CONFIG.
  elo jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1);

-- ─── Sessions (a day of play) ───────────────────────────────────────────────

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  played_on date not null default current_date,
  status text not null default 'open' check (status in ('open', 'closed')),
  mode text not null default 'doubles' check (mode in ('singles', 'doubles')),
  present_player_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- ─── Tournaments ────────────────────────────────────────────────────────────

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  format text not null check (format in ('round_robin', 'single_elim', 'double_elim')),
  mode text not null check (mode in ('singles', 'doubles')),
  team_formation text check (team_formation in ('fixed', 'balanced', 'snake', 'random')),
  scoring text not null check (scoring in ('sideout', 'rally')),
  points_to_win int not null check (points_to_win between 1 and 50),
  win_by int not null default 2 check (win_by in (1, 2)),
  best_of int not null default 1 check (best_of in (1, 3, 5)),
  -- Round robin only: top N go on to a knockout playoff (0 = none).
  playoff_size int not null default 0 check (playoff_size in (0, 2, 4, 8)),
  is_rated boolean not null default true,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  winner_entry_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  seed int not null check (seed >= 1),
  name text,
  player_ids uuid[] not null check (cardinality(player_ids) between 1 and 2),
  unique (tournament_id, seed)
);

create index on public.tournament_entries (tournament_id);

alter table public.tournaments
  add constraint tournaments_winner_entry_fk foreign key (winner_entry_id)
  references public.tournament_entries (id) on delete set null deferrable initially deferred;

-- ─── Matches ────────────────────────────────────────────────────────────────

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('singles', 'doubles')),
  scoring text not null default 'sideout' check (scoring in ('sideout', 'rally')),
  points_to_win int not null default 11 check (points_to_win between 1 and 50),
  win_by int not null default 2 check (win_by in (1, 2)),
  best_of int not null default 1 check (best_of in (1, 3, 5)),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed', 'void')),
  is_rated boolean not null default true,
  team_a uuid[] not null default '{}',
  team_b uuid[] not null default '{}',
  -- [{"a": 11, "b": 7}, ...]
  games jsonb not null default '[]'::jsonb check (jsonb_typeof(games) = 'array'),
  winner text check (winner in ('A', 'B')),
  first_server text not null default 'A' check (first_server in ('A', 'B')),
  -- Scoring state (see src/lib/scoring) so watchers never need to replay rallies.
  live_state jsonb,
  rally_count int not null default 0,
  session_id uuid references public.sessions (id) on delete set null,
  tournament_id uuid references public.tournaments (id) on delete cascade,
  queue_position int,
  -- Tournament bracket wiring.
  bracket_key text,
  bracket_round int,
  bracket_label text,
  stage text check (stage in ('group', 'playoff')),
  entry_a_id uuid references public.tournament_entries (id) on delete set null,
  entry_b_id uuid references public.tournament_entries (id) on delete set null,
  winner_to uuid references public.matches (id) on delete set null deferrable initially deferred,
  winner_to_slot text check (winner_to_slot in ('A', 'B')),
  loser_to uuid references public.matches (id) on delete set null deferrable initially deferred,
  loser_to_slot text check (loser_to_slot in ('A', 'B')),
  -- Grand-final reset: only played if the slot-B entry wins the previous final.
  is_conditional boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  -- Elo replay order.
  played_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_has_result check (
    status <> 'completed' or (winner is not null and played_at is not null and jsonb_array_length(games) > 0)
  )
);

create index on public.matches (status);
create index on public.matches (played_at);
create index on public.matches (tournament_id);
create index on public.matches (session_id);
create index on public.matches using gin (team_a);
create index on public.matches using gin (team_b);

create table public.rally_events (
  match_id uuid not null references public.matches (id) on delete cascade,
  seq int not null check (seq >= 1),
  event jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

create function public.validate_match() returns trigger
language plpgsql set search_path = ''
as $$
declare
  per_team int := case new.mode when 'singles' then 1 else 2 end;
  everyone uuid[] := new.team_a || new.team_b;
begin
  if cardinality(new.team_a) > per_team or cardinality(new.team_b) > per_team then
    raise exception 'A % match has % player(s) per team', new.mode, per_team;
  end if;
  if new.status in ('live', 'completed')
     and (cardinality(new.team_a) <> per_team or cardinality(new.team_b) <> per_team) then
    raise exception 'Both teams need % player(s) before the match can start', per_team;
  end if;
  if (select count(distinct p) from unnest(everyone) p) <> cardinality(everyone) then
    raise exception 'A player can only appear once in a match';
  end if;
  if (select count(*) from public.players where id = any (everyone)) <> cardinality(everyone) then
    raise exception 'Unknown player in match';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger matches_validate before insert or update on public.matches
  for each row execute function public.validate_match();

create function public.protect_player_delete() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.matches where old.id = any (team_a) or old.id = any (team_b))
     or exists (select 1 from public.tournament_entries where old.id = any (player_ids)) then
    raise exception 'This player has matches on record. Mark them inactive instead of deleting.';
  end if;
  return old;
end;
$$;

create trigger players_protect_delete before delete on public.players
  for each row execute function public.protect_player_delete();

-- ─── Audit log ──────────────────────────────────────────────────────────────

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb
);

create function public.audit_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  noise text[] := array['live_state', 'rally_count', 'updated_at', 'started_at'];
  before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- Point-by-point scoring and starting a match aren't worth an audit entry.
  if tg_op = 'UPDATE' and tg_table_name = 'matches'
     and (before - noise - 'status') = (after - noise - 'status')
     and (before ->> 'status' = after ->> 'status'
          or (before ->> 'status' = 'scheduled' and after ->> 'status' = 'live')) then
    return new;
  end if;
  insert into public.audit_log (action, entity, entity_id, details)
  values (
    lower(tg_op),
    tg_table_name,
    coalesce(after ->> 'id', before ->> 'id'),
    jsonb_build_object('old', before - noise, 'new', after - noise)
  );
  return coalesce(new, old);
end;
$$;

create trigger players_audit after insert or update or delete on public.players
  for each row execute function public.audit_change();
create trigger matches_audit after insert or update or delete on public.matches
  for each row execute function public.audit_change();
create trigger tournaments_audit after insert or update or delete on public.tournaments
  for each row execute function public.audit_change();
create trigger app_settings_audit after update on public.app_settings
  for each row execute function public.audit_change();

-- ─── Row level security ─────────────────────────────────────────────────────

alter table public.players enable row level security;
alter table public.referees enable row level security;
alter table public.app_settings enable row level security;
alter table public.sessions enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.matches enable row level security;
alter table public.rally_events enable row level security;
alter table public.audit_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['players', 'app_settings', 'sessions', 'tournaments', 'tournament_entries', 'matches', 'rally_events']
  loop
    execute format('create policy "Anyone can read" on public.%I for select to anon, authenticated using (true)', t);
    execute format(
      'create policy "Referees can write" on public.%I for all to authenticated using ((select public.is_referee())) with check ((select public.is_referee()))',
      t
    );
  end loop;
end;
$$;

create policy "Referees can read the audit log" on public.audit_log
  for select to authenticated using ((select public.is_referee()));

create policy "Referees can see themselves" on public.referees
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.players, public.app_settings, public.sessions, public.tournaments,
  public.tournament_entries, public.matches, public.rally_events to anon, authenticated;
grant insert, update, delete on public.players, public.app_settings, public.sessions, public.tournaments,
  public.tournament_entries, public.matches, public.rally_events to authenticated;
grant select on public.audit_log, public.referees to authenticated;

-- ─── RPCs ───────────────────────────────────────────────────────────────────

create function public.require_referee() returns void
language plpgsql stable set search_path = ''
as $$
begin
  if not public.is_referee() then
    raise exception 'Only the referee can do that' using errcode = '42501';
  end if;
end;
$$;

-- Append a rally. `p_seq` must be exactly one past the stored count, so two
-- devices scoring the same match can't silently overwrite each other.
create function public.record_rally(p_match_id uuid, p_seq int, p_event jsonb, p_live_state jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  update public.matches
     set rally_count = p_seq,
         live_state = p_live_state,
         status = 'live',
         started_at = coalesce(started_at, now())
   where id = p_match_id and rally_count = p_seq - 1 and status in ('scheduled', 'live');
  if not found then
    raise exception 'The score changed on another device. Reloading the latest score.' using errcode = 'P0001';
  end if;
  insert into public.rally_events (match_id, seq, event) values (p_match_id, p_seq, p_event);
end;
$$;

create function public.undo_rally(p_match_id uuid, p_seq int, p_live_state jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  update public.matches
     set rally_count = p_seq - 1,
         live_state = p_live_state
   where id = p_match_id and rally_count = p_seq and status = 'live';
  if not found then
    raise exception 'The score changed on another device. Reloading the latest score.' using errcode = 'P0001';
  end if;
  delete from public.rally_events where match_id = p_match_id and seq = p_seq;
end;
$$;

-- Place a finished match's winner/loser into the bracket match it feeds.
create function public.advance_slot(p_target uuid, p_slot text, p_entry uuid, p_team uuid[])
returns void
language plpgsql set search_path = ''
as $$
declare
  target public.matches;
begin
  select * into target from public.matches where id = p_target for update;
  if target.status in ('live', 'completed') and (case p_slot when 'A' then target.entry_a_id else target.entry_b_id end) is distinct from p_entry then
    raise exception '"%" has already started, so this result can no longer change who plays in it.', target.bracket_label;
  end if;
  if p_slot = 'A' then
    update public.matches set entry_a_id = p_entry, team_a = p_team,
      status = case when status = 'void' then 'scheduled' else status end
     where id = p_target;
  else
    update public.matches set entry_b_id = p_entry, team_b = p_team,
      status = case when status = 'void' then 'scheduled' else status end
     where id = p_target;
  end if;
end;
$$;

-- Record a final result (from live scoring or quick entry, or a correction)
-- and advance the bracket. Ratings update on every client automatically.
create function public.complete_match(p_match_id uuid, p_games jsonb, p_winner text, p_played_at timestamptz default null)
returns void
language plpgsql set search_path = ''
as $$
declare
  m public.matches;
  target public.matches;
  win_entry uuid;
  lose_entry uuid;
  win_team uuid[];
  lose_team uuid[];
begin
  perform public.require_referee();
  if p_winner not in ('A', 'B') then
    raise exception 'Winner must be A or B';
  end if;

  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if m.status = 'void' then
    raise exception 'This match was voided. Restore it before entering a result.';
  end if;

  update public.matches
     set status = 'completed',
         games = p_games,
         winner = p_winner,
         completed_at = coalesce(completed_at, now()),
         played_at = coalesce(p_played_at, played_at, now())
   where id = p_match_id;

  if m.tournament_id is null then
    return;
  end if;

  win_entry := case p_winner when 'A' then m.entry_a_id else m.entry_b_id end;
  lose_entry := case p_winner when 'A' then m.entry_b_id else m.entry_a_id end;
  win_team := case p_winner when 'A' then m.team_a else m.team_b end;
  lose_team := case p_winner when 'A' then m.team_b else m.team_a end;

  if m.winner_to is not null then
    select * into target from public.matches where id = m.winner_to for update;
    if target.is_conditional and p_winner = 'A' then
      -- The unbeaten finalist won the grand final: no reset match needed.
      if target.status in ('live', 'completed') then
        raise exception 'The reset final has already started, so this result can no longer change.';
      end if;
      update public.matches set status = 'void' where id = target.id;
      update public.tournaments set status = 'completed', winner_entry_id = win_entry, completed_at = now()
       where id = m.tournament_id;
      return;
    end if;
    perform public.advance_slot(m.winner_to, m.winner_to_slot, win_entry, win_team);
  end if;

  if m.loser_to is not null then
    perform public.advance_slot(m.loser_to, m.loser_to_slot, lose_entry, lose_team);
  end if;

  if m.bracket_key is not null and m.winner_to is null then
    update public.tournaments set status = 'completed', winner_entry_id = win_entry, completed_at = now()
     where id = m.tournament_id;
  elsif m.winner_to is not null then
    -- A corrected earlier result can re-open a tournament that had finished.
    update public.tournaments set status = 'active', winner_entry_id = null, completed_at = null
     where id = m.tournament_id and status = 'completed'
       and exists (select 1 from public.matches where tournament_id = m.tournament_id and status in ('scheduled', 'live'));
  end if;
end;
$$;

-- Insert tournament matches in one statement (they reference each other).
create function public.insert_tournament_matches(p_matches jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  insert into public.matches (
    id, mode, scoring, points_to_win, win_by, best_of, is_rated, tournament_id, queue_position,
    bracket_key, bracket_round, bracket_label, stage, entry_a_id, entry_b_id, team_a, team_b,
    winner_to, winner_to_slot, loser_to, loser_to_slot, is_conditional
  )
  select id, mode, scoring, points_to_win, win_by, best_of, is_rated, tournament_id, queue_position,
         bracket_key, bracket_round, bracket_label, stage, entry_a_id, entry_b_id,
         coalesce(team_a, '{}'), coalesce(team_b, '{}'),
         winner_to, winner_to_slot, loser_to, loser_to_slot, coalesce(is_conditional, false)
    from jsonb_to_recordset(p_matches) as x(
      id uuid, mode text, scoring text, points_to_win int, win_by int, best_of int, is_rated boolean,
      tournament_id uuid, queue_position int, bracket_key text, bracket_round int, bracket_label text,
      stage text, entry_a_id uuid, entry_b_id uuid, team_a uuid[], team_b uuid[], winner_to uuid,
      winner_to_slot text, loser_to uuid, loser_to_slot text, is_conditional boolean
    );
end;
$$;

create function public.create_tournament(p_tournament jsonb, p_entries jsonb, p_matches jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  insert into public.tournaments (id, name, format, mode, team_formation, scoring, points_to_win, win_by, best_of, playoff_size, is_rated)
  select id, name, format, mode, team_formation, scoring, points_to_win, coalesce(win_by, 2), coalesce(best_of, 1),
         coalesce(playoff_size, 0), coalesce(is_rated, true)
    from jsonb_to_record(p_tournament) as x(
      id uuid, name text, format text, mode text, team_formation text, scoring text,
      points_to_win int, win_by int, best_of int, playoff_size int, is_rated boolean
    );
  insert into public.tournament_entries (id, tournament_id, seed, name, player_ids)
  select id, tournament_id, seed, name, player_ids
    from jsonb_to_recordset(p_entries) as x(id uuid, tournament_id uuid, seed int, name text, player_ids uuid[]);
  perform public.insert_tournament_matches(p_matches);
end;
$$;

revoke execute on function public.record_rally, public.undo_rally, public.complete_match,
  public.insert_tournament_matches, public.create_tournament, public.advance_slot from public, anon;
grant execute on function public.record_rally, public.undo_rally, public.complete_match,
  public.insert_tournament_matches, public.create_tournament to authenticated;
grant execute on function public.is_referee to anon, authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────

alter publication supabase_realtime add table
  public.players, public.app_settings, public.sessions, public.tournaments, public.tournament_entries, public.matches;
