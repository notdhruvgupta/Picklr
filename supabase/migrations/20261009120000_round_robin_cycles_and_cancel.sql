-- Double/triple round robins, and an atomic tournament cancel.

alter table public.tournaments
  add column round_robin_cycles smallint not null default 1
    check (round_robin_cycles between 1 and 3);

comment on column public.tournaments.round_robin_cycles is
  'Round robin only: how many times each pair meets (1 = single, 2 = double, 3 = triple).';

create or replace function public.create_tournament(p_tournament jsonb, p_entries jsonb, p_matches jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  insert into public.tournaments (
    id, name, format, mode, team_formation, scoring, points_to_win, win_by, best_of, playoff_size, is_rated, round_robin_cycles
  )
  select id, name, format, mode, team_formation, scoring, points_to_win, coalesce(win_by, 2), coalesce(best_of, 1),
         coalesce(playoff_size, 0), coalesce(is_rated, true), coalesce(round_robin_cycles, 1)
    from jsonb_to_record(p_tournament) as x(
      id uuid, name text, format text, mode text, team_formation text, scoring text,
      points_to_win int, win_by int, best_of int, playoff_size int, is_rated boolean, round_robin_cycles smallint
    );
  insert into public.tournament_entries (id, tournament_id, seed, name, player_ids)
  select id, tournament_id, seed, name, player_ids
    from jsonb_to_recordset(p_entries) as x(id uuid, tournament_id uuid, seed int, name text, player_ids uuid[]);
  perform public.insert_tournament_matches(p_matches);
end;
$$;

-- Cancel in one transaction: completed matches keep counting; anything unfinished is voided.
create function public.cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_referee();
  update public.tournaments
     set status = 'cancelled', completed_at = now()
   where id = p_tournament_id and status = 'active';
  if not found then
    raise exception 'This tournament is no longer in progress.';
  end if;
  update public.matches
     set status = 'void'
   where tournament_id = p_tournament_id and status in ('scheduled', 'live');
end;
$$;

revoke execute on function public.cancel_tournament from public, anon;
grant execute on function public.cancel_tournament to authenticated;
