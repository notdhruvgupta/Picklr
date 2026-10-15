-- Team tournaments ("Triple Team Tournament").
--
-- Teams of 3 (or 4) play a double or triple round robin of doubles matches.
-- Each match a team fields 2 players, and every player must end up playing a
-- fair share (min..max) of the team's group matches. The top two teams meet in
-- a final where both teams make one substitution when the first team reaches
-- the threshold; that final is rated in segments (see src/lib/elo).

-- ─── Tournaments and entries ────────────────────────────────────────────────

alter table public.tournaments drop constraint tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check
  check (format in ('round_robin', 'single_elim', 'double_elim', 'team_round_robin'));

alter table public.tournaments
  add column final_scoring text check (final_scoring in ('sideout', 'rally')),
  add column final_points_to_win int check (final_points_to_win between 1 and 50),
  add column final_win_by int check (final_win_by in (1, 2)),
  add column sub_threshold int check (sub_threshold between 1 and 49),
  add constraint tournaments_team_settings check (
    format <> 'team_round_robin'
    or (round_robin_cycles in (2, 3)
        and final_scoring is not null and final_points_to_win is not null and final_win_by is not null
        and sub_threshold is not null and sub_threshold < final_points_to_win)
  );

alter table public.tournament_entries drop constraint tournament_entries_player_ids_check;
alter table public.tournament_entries add constraint tournament_entries_player_ids_check
  check (cardinality(player_ids) between 1 and 4);

-- ─── Matches: the final's substitution ──────────────────────────────────────

alter table public.matches
  add column sub_threshold int check (sub_threshold between 1 and 49),
  -- [{"teamA": [...], "teamB": [...], "pointsA": 10, "pointsB": 7}, ...]: who was on court and what they scored.
  add column segments jsonb check (segments is null or jsonb_typeof(segments) = 'array');

-- A team final lists everyone who played for a side (the starting pair plus the substitute).
create or replace function public.validate_match() returns trigger
language plpgsql set search_path = ''
as $$
declare
  per_team int := case new.mode when 'singles' then 1 else 2 end;
  max_team int := case when new.segments is not null then per_team + 1 else per_team end;
  everyone uuid[] := new.team_a || new.team_b;
begin
  if cardinality(new.team_a) > max_team or cardinality(new.team_b) > max_team then
    raise exception 'A % match has % player(s) per team', new.mode, per_team;
  end if;
  if new.status in ('live', 'completed')
     and (cardinality(new.team_a) < per_team or cardinality(new.team_b) < per_team) then
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

-- Players who appear on one side across the segments, in order of first appearance.
create function public.segment_players(p_segments jsonb, p_side text) returns uuid[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(x.pid order by x.first_seen), '{}')
    from (
      select (e.val #>> '{}')::uuid as pid, min(s.si * 100 + e.pi) as first_seen
        from jsonb_array_elements(p_segments) with ordinality as s(seg, si)
        cross join lateral jsonb_array_elements(s.seg -> p_side) with ordinality as e(val, pi)
       group by 1
    ) x;
$$;

-- ─── Lineups: the fair-share rule ───────────────────────────────────────────

-- Mirrors lineupFeasible() in src/lib/team-tournament.ts: with each player's
-- lineup count c and the team's matches still without a lineup R, everyone can
-- still finish between min and max iff lo = max(0, min - c) <= hi = min(max - c, R)
-- for each player and sum(lo) <= 2R <= sum(hi).
create function public.team_lineup_ok(p_tournament_id uuid, p_entry_id uuid) returns boolean
language plpgsql stable set search_path = ''
as $$
declare
  roster uuid[];
  teams int;
  cycles int;
  team_matches int;
  min_cap int;
  max_cap int;
  remaining int;
  sum_lo int := 0;
  sum_hi int := 0;
  c int;
  lo int;
  hi int;
  p uuid;
begin
  select player_ids into roster from public.tournament_entries where id = p_entry_id;
  select count(*) into teams from public.tournament_entries where tournament_id = p_tournament_id;
  select round_robin_cycles into cycles from public.tournaments where id = p_tournament_id;
  team_matches := (teams - 1) * cycles;
  min_cap := floor(2.0 * team_matches / cardinality(roster));
  max_cap := ceil(2.0 * team_matches / cardinality(roster));

  select count(*) into remaining
    from public.matches m
   where m.tournament_id = p_tournament_id and m.stage = 'group' and m.status <> 'void'
     and ((m.entry_a_id = p_entry_id and cardinality(m.team_a) = 0)
       or (m.entry_b_id = p_entry_id and cardinality(m.team_b) = 0));

  foreach p in array roster loop
    select count(*) into c
      from public.matches m
     where m.tournament_id = p_tournament_id and m.stage = 'group' and m.status <> 'void'
       and ((m.entry_a_id = p_entry_id and p = any (m.team_a))
         or (m.entry_b_id = p_entry_id and p = any (m.team_b)));
    if c > max_cap then
      return false;
    end if;
    lo := greatest(0, min_cap - c);
    hi := least(max_cap - c, remaining);
    if lo > hi then
      return false;
    end if;
    sum_lo := sum_lo + lo;
    sum_hi := sum_hi + hi;
  end loop;
  return sum_lo <= 2 * remaining and 2 * remaining <= sum_hi;
end;
$$;

-- Set (or correct) which 2 players each team fields in a team-tournament match.
create function public.set_lineup(p_match_id uuid, p_team_a uuid[], p_team_b uuid[])
returns void
language plpgsql set search_path = ''
as $$
declare
  m public.matches;
  t public.tournaments;
  roster_a uuid[];
  roster_b uuid[];
begin
  perform public.require_match_owner(p_match_id);
  select * into m from public.matches where id = p_match_id for update;
  select * into t from public.tournaments where id = m.tournament_id;
  if t.id is null or t.format <> 'team_round_robin' then
    raise exception 'Lineups are only for team tournaments.';
  end if;
  if m.entry_a_id is null or m.entry_b_id is null then
    raise exception 'This match doesn''t have both teams yet.';
  end if;
  if m.status = 'void' then
    raise exception 'This match isn''t being played.';
  end if;
  if m.stage = 'playoff' and m.status <> 'scheduled' then
    raise exception 'Once the final has started, its lineups only change through the substitution.';
  end if;
  if coalesce(cardinality(p_team_a), 0) <> 2 or coalesce(cardinality(p_team_b), 0) <> 2 then
    raise exception 'Each team fields 2 players.';
  end if;
  select player_ids into roster_a from public.tournament_entries where id = m.entry_a_id;
  select player_ids into roster_b from public.tournament_entries where id = m.entry_b_id;
  if not (p_team_a <@ roster_a and p_team_b <@ roster_b) then
    raise exception 'Each team can only field its own players.';
  end if;

  update public.matches set team_a = p_team_a, team_b = p_team_b where id = p_match_id;

  if m.stage = 'group' then
    if not public.team_lineup_ok(m.tournament_id, m.entry_a_id) then
      raise exception '% can''t field that pair: someone would end up with too many or too few matches.',
        (select coalesce(name, 'The first team') from public.tournament_entries where id = m.entry_a_id);
    end if;
    if not public.team_lineup_ok(m.tournament_id, m.entry_b_id) then
      raise exception '% can''t field that pair: someone would end up with too many or too few matches.',
        (select coalesce(name, 'The second team') from public.tournament_entries where id = m.entry_b_id);
    end if;
  end if;
end;
$$;

-- "Change players" on a team-tournament match is a lineup correction.
create or replace function public.set_match_players(p_match_id uuid, p_team_a uuid[], p_team_b uuid[])
returns void
language plpgsql set search_path = ''
as $$
declare
  m public.matches;
  per_team int;
begin
  perform public.require_match_owner(p_match_id);
  select * into m from public.matches where id = p_match_id for update;
  if exists (select 1 from public.tournaments where id = m.tournament_id and format = 'team_round_robin') then
    perform public.set_lineup(p_match_id, p_team_a, p_team_b);
    return;
  end if;
  if m.status = 'void' then
    raise exception 'Restore this match before changing its players.';
  end if;

  per_team := case m.mode when 'singles' then 1 else 2 end;
  if coalesce(cardinality(p_team_a), 0) <> per_team or coalesce(cardinality(p_team_b), 0) <> per_team then
    raise exception 'Each team needs % player(s).', per_team;
  end if;

  if m.tournament_id is null then
    update public.matches set team_a = p_team_a, team_b = p_team_b where id = p_match_id;
  else
    if m.entry_a_id is null or m.entry_b_id is null then
      raise exception 'This bracket match doesn''t have both teams yet.';
    end if;
    update public.tournament_entries set player_ids = p_team_a where id = m.entry_a_id;
    update public.tournament_entries set player_ids = p_team_b where id = m.entry_b_id;
    if exists (
      select 1
        from public.tournament_entries e1
        join public.tournament_entries e2 on e2.tournament_id = e1.tournament_id and e2.id > e1.id
       where e1.tournament_id = m.tournament_id and e1.player_ids && e2.player_ids
    ) then
      raise exception 'A player can only be on one team in a tournament.';
    end if;
    update public.matches x
       set team_a = coalesce((select e.player_ids from public.tournament_entries e where e.id = x.entry_a_id), x.team_a),
           team_b = coalesce((select e.player_ids from public.tournament_entries e where e.id = x.entry_b_id), x.team_b)
     where x.tournament_id = m.tournament_id
       and (x.entry_a_id in (m.entry_a_id, m.entry_b_id) or x.entry_b_id in (m.entry_a_id, m.entry_b_id));
  end if;

  if m.session_id is not null then
    update public.sessions s
       set present_player_ids = s.present_player_ids || array(
             select distinct p from unnest(p_team_a || p_team_b) as p where p <> all (s.present_player_ids))
     where s.id = m.session_id;
  end if;
end;
$$;

-- ─── Results: store the final's segments ────────────────────────────────────

-- New optional parameter: drop the old signature so RPC calls stay unambiguous.
drop function public.complete_match(uuid, jsonb, text, timestamptz);

create function public.complete_match(
  p_match_id uuid,
  p_games jsonb,
  p_winner text,
  p_played_at timestamptz default null,
  p_segments jsonb default null
)
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
  perform public.require_match_owner(p_match_id);
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

  if p_segments is not null and m.sub_threshold is null then
    raise exception 'Only a team final is scored in segments.';
  end if;
  -- New or already stored, a final's segments must add up to its score.
  if coalesce(p_segments, m.segments) is not null
     and ((select sum((s ->> 'pointsA')::int) from jsonb_array_elements(coalesce(p_segments, m.segments)) s) <> (p_games -> 0 ->> 'a')::int
       or (select sum((s ->> 'pointsB')::int) from jsonb_array_elements(coalesce(p_segments, m.segments)) s) <> (p_games -> 0 ->> 'b')::int) then
    raise exception 'The segment scores don''t add up to the final score.';
  end if;

  update public.matches
     set status = 'completed',
         games = p_games,
         winner = p_winner,
         completed_at = coalesce(completed_at, now()),
         played_at = coalesce(p_played_at, played_at, now()),
         segments = coalesce(p_segments, segments),
         team_a = case when p_segments is null then team_a else public.segment_players(p_segments, 'teamA') end,
         team_b = case when p_segments is null then team_b else public.segment_players(p_segments, 'teamB') end
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
    update public.tournaments set status = 'active', winner_entry_id = null, completed_at = null
     where id = m.tournament_id and status = 'completed'
       and exists (select 1 from public.matches where tournament_id = m.tournament_id and status in ('scheduled', 'live'));
  end if;
end;
$$;

-- ─── Creating tournaments with the new fields ───────────────────────────────

create or replace function public.insert_tournament_matches(p_matches jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  insert into public.matches (
    id, mode, scoring, points_to_win, win_by, best_of, is_rated, tournament_id, queue_position,
    bracket_key, bracket_round, bracket_label, stage, entry_a_id, entry_b_id, team_a, team_b,
    winner_to, winner_to_slot, loser_to, loser_to_slot, is_conditional, sub_threshold
  )
  select id, mode, scoring, points_to_win, win_by, best_of, is_rated, tournament_id, queue_position,
         bracket_key, bracket_round, bracket_label, stage, entry_a_id, entry_b_id,
         coalesce(team_a, '{}'), coalesce(team_b, '{}'),
         winner_to, winner_to_slot, loser_to, loser_to_slot, coalesce(is_conditional, false), sub_threshold
    from jsonb_to_recordset(p_matches) as x(
      id uuid, mode text, scoring text, points_to_win int, win_by int, best_of int, is_rated boolean,
      tournament_id uuid, queue_position int, bracket_key text, bracket_round int, bracket_label text,
      stage text, entry_a_id uuid, entry_b_id uuid, team_a uuid[], team_b uuid[], winner_to uuid,
      winner_to_slot text, loser_to uuid, loser_to_slot text, is_conditional boolean, sub_threshold int
    );
end;
$$;

create or replace function public.create_tournament(p_tournament jsonb, p_entries jsonb, p_matches jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  insert into public.tournaments (
    id, name, format, mode, team_formation, scoring, points_to_win, win_by, best_of, playoff_size, is_rated,
    round_robin_cycles, final_scoring, final_points_to_win, final_win_by, sub_threshold
  )
  select id, name, format, mode, team_formation, scoring, points_to_win, coalesce(win_by, 2), coalesce(best_of, 1),
         coalesce(playoff_size, 0), coalesce(is_rated, true), coalesce(round_robin_cycles, 1),
         final_scoring, final_points_to_win, final_win_by, sub_threshold
    from jsonb_to_record(p_tournament) as x(
      id uuid, name text, format text, mode text, team_formation text, scoring text,
      points_to_win int, win_by int, best_of int, playoff_size int, is_rated boolean, round_robin_cycles smallint,
      final_scoring text, final_points_to_win int, final_win_by int, sub_threshold int
    );
  insert into public.tournament_entries (id, tournament_id, seed, name, player_ids)
  select id, tournament_id, seed, name, player_ids
    from jsonb_to_recordset(p_entries) as x(id uuid, tournament_id uuid, seed int, name text, player_ids uuid[]);
  perform public.insert_tournament_matches(p_matches);
end;
$$;

revoke execute on function public.complete_match, public.set_lineup, public.team_lineup_ok, public.segment_players from public, anon;
grant execute on function public.complete_match, public.set_lineup, public.team_lineup_ok, public.segment_players to authenticated;
