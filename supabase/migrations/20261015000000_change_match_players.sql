-- Correct who played in a match (e.g. the wrong player was picked).
--
-- Friendly and session matches change directly. In a tournament a team is an
-- entry that plays several matches, so the correction updates the entry and
-- every match it appears in. Ratings follow automatically: every client
-- replays match history.
create function public.set_match_players(p_match_id uuid, p_team_a uuid[], p_team_b uuid[])
returns void
language plpgsql set search_path = ''
as $$
declare
  m public.matches;
  per_team int;
begin
  perform public.require_match_owner(p_match_id);
  select * into m from public.matches where id = p_match_id for update;
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
    -- Both sides in one statement, so swapping players between the two teams never
    -- leaves a match momentarily listing someone twice.
    update public.matches x
       set team_a = coalesce((select e.player_ids from public.tournament_entries e where e.id = x.entry_a_id), x.team_a),
           team_b = coalesce((select e.player_ids from public.tournament_entries e where e.id = x.entry_b_id), x.team_b)
     where x.tournament_id = m.tournament_id
       and (x.entry_a_id in (m.entry_a_id, m.entry_b_id) or x.entry_b_id in (m.entry_a_id, m.entry_b_id));
  end if;

  -- Keep the session's check-in list in step with who actually played.
  if m.session_id is not null then
    update public.sessions s
       set present_player_ids = s.present_player_ids || array(
             select distinct p from unnest(p_team_a || p_team_b) as p where p <> all (s.present_player_ids))
     where s.id = m.session_id;
  end if;
end;
$$;

revoke execute on function public.set_match_players from public, anon;
grant execute on function public.set_match_players to authenticated;
