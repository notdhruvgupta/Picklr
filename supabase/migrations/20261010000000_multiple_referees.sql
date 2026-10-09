-- Multiple referees.
--
-- Every match, session and tournament belongs to the referee who started it
-- (`created_by`), and only that referee can change it, score it, or add to it.
-- Players and settings stay shared by all referees. An owner can hand an event
-- over to another referee. Rows with no owner (e.g. from before this migration
-- when no referee existed) can be edited by any referee.

-- ─── Referees: public display names ─────────────────────────────────────────

alter table public.referees
  add constraint referees_display_name_length check (length(btrim(display_name)) between 1 and 40);

drop policy "Referees can see themselves" on public.referees;

create policy "Anyone can read referees" on public.referees
  for select to anon, authenticated using (true);

create policy "Referees can rename themselves" on public.referees
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.referees to anon, authenticated;
grant update (display_name) on public.referees to authenticated;

alter publication supabase_realtime add table public.referees;

-- ─── Ownership columns ──────────────────────────────────────────────────────

alter table public.matches
  add column created_by uuid default auth.uid() references public.referees (user_id) on delete set null;
alter table public.sessions
  add column created_by uuid default auth.uid() references public.referees (user_id) on delete set null;
alter table public.tournaments
  add column created_by uuid default auth.uid() references public.referees (user_id) on delete set null;

create index on public.matches (created_by);
create index on public.sessions (created_by);
create index on public.tournaments (created_by);

-- Existing rows belong to the first referee (quietly: no audit entries for the backfill).
alter table public.matches disable trigger matches_audit;
alter table public.tournaments disable trigger tournaments_audit;
update public.matches set created_by = (select user_id from public.referees order by created_at limit 1) where created_by is null;
update public.sessions set created_by = (select user_id from public.referees order by created_at limit 1) where created_by is null;
update public.tournaments set created_by = (select user_id from public.referees order by created_at limit 1) where created_by is null;
alter table public.matches enable trigger matches_audit;
alter table public.tournaments enable trigger tournaments_audit;

-- ─── Ownership helpers ──────────────────────────────────────────────────────

-- True if the signed-in user is a referee allowed to change something owned by `p_owner`.
create function public.owns(p_owner uuid) returns boolean
language sql stable set search_path = ''
as $$
  select public.is_referee() and (p_owner is null or p_owner = (select auth.uid()));
$$;

create function public.owner_name(p_owner uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select display_name from public.referees where user_id = p_owner), 'another referee');
$$;

-- Owners can't be changed by an ordinary update, only by hand_over().
create function public.protect_owner() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by
     and coalesce(current_setting('picklr.hand_over', true), '') <> 'on' then
    raise exception 'Only a hand-over can change which referee runs this.';
  end if;
  return new;
end;
$$;

create trigger matches_protect_owner before update on public.matches
  for each row execute function public.protect_owner();
create trigger sessions_protect_owner before update on public.sessions
  for each row execute function public.protect_owner();
create trigger tournaments_protect_owner before update on public.tournaments
  for each row execute function public.protect_owner();

create function public.require_match_owner(p_match_id uuid) returns void
language plpgsql stable set search_path = ''
as $$
declare
  owner uuid;
begin
  perform public.require_referee();
  select created_by into owner from public.matches where id = p_match_id;
  if not found then
    raise exception 'Match not found';
  end if;
  if not public.owns(owner) then
    raise exception 'Only % can change this match.', public.owner_name(owner) using errcode = '42501';
  end if;
end;
$$;

-- ─── Row level security: owner-only writes ──────────────────────────────────

drop policy "Referees can write" on public.matches;
drop policy "Referees can write" on public.sessions;
drop policy "Referees can write" on public.tournaments;
drop policy "Referees can write" on public.tournament_entries;
drop policy "Referees can write" on public.rally_events;

create policy "Referees create their own sessions" on public.sessions
  for insert to authenticated
  with check ((select public.is_referee()) and created_by = (select auth.uid()));
create policy "Owners change their sessions" on public.sessions
  for update to authenticated using (public.owns(created_by)) with check (public.owns(created_by));
create policy "Owners delete their sessions" on public.sessions
  for delete to authenticated using (public.owns(created_by));

create policy "Referees create their own tournaments" on public.tournaments
  for insert to authenticated
  with check ((select public.is_referee()) and created_by = (select auth.uid()));
create policy "Owners change their tournaments" on public.tournaments
  for update to authenticated using (public.owns(created_by)) with check (public.owns(created_by));
create policy "Owners delete their tournaments" on public.tournaments
  for delete to authenticated using (public.owns(created_by));

create policy "Tournament owners manage entries" on public.tournament_entries
  for all to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.owns(t.created_by)))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and public.owns(t.created_by)));

-- A match can only join a session or tournament run by the same referee.
create policy "Referees create their own matches" on public.matches
  for insert to authenticated
  with check (
    (select public.is_referee())
    and created_by = (select auth.uid())
    and (session_id is null or exists (select 1 from public.sessions s where s.id = session_id and public.owns(s.created_by)))
    and (tournament_id is null or exists (select 1 from public.tournaments t where t.id = tournament_id and public.owns(t.created_by)))
  );
create policy "Owners change their matches" on public.matches
  for update to authenticated using (public.owns(created_by)) with check (public.owns(created_by));
create policy "Owners delete their matches" on public.matches
  for delete to authenticated using (public.owns(created_by));

create policy "Match owners manage rallies" on public.rally_events
  for all to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and public.owns(m.created_by)))
  with check (exists (select 1 from public.matches m where m.id = match_id and public.owns(m.created_by)));

-- ─── RPCs: clear ownership errors ───────────────────────────────────────────

create or replace function public.record_rally(p_match_id uuid, p_seq int, p_event jsonb, p_live_state jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_match_owner(p_match_id);
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

create or replace function public.undo_rally(p_match_id uuid, p_seq int, p_live_state jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.require_match_owner(p_match_id);
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

create or replace function public.complete_match(p_match_id uuid, p_games jsonb, p_winner text, p_played_at timestamptz default null)
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

create or replace function public.cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  owner uuid;
begin
  perform public.require_referee();
  select created_by into owner from public.tournaments where id = p_tournament_id;
  if not found then
    raise exception 'Tournament not found';
  end if;
  if not public.owns(owner) then
    raise exception 'Only % can cancel this tournament.', public.owner_name(owner) using errcode = '42501';
  end if;
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

-- Pass a standalone match, a session (with its matches) or a tournament (with
-- its matches) to another referee. Only the current owner can do this.
create function public.hand_over(p_kind text, p_id uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  perform public.require_referee();
  if not exists (select 1 from public.referees where user_id = p_to) then
    raise exception 'That person isn''t a referee.';
  end if;

  if p_kind = 'match' then
    select created_by into owner from public.matches where id = p_id for update;
    if not found then raise exception 'Match not found'; end if;
    if exists (select 1 from public.matches where id = p_id and (session_id is not null or tournament_id is not null)) then
      raise exception 'This match is part of a session or tournament. Hand that over instead.';
    end if;
  elsif p_kind = 'session' then
    select created_by into owner from public.sessions where id = p_id for update;
    if not found then raise exception 'Session not found'; end if;
  elsif p_kind = 'tournament' then
    select created_by into owner from public.tournaments where id = p_id for update;
    if not found then raise exception 'Tournament not found'; end if;
  else
    raise exception 'Unknown kind: %', p_kind;
  end if;

  if not public.owns(owner) then
    raise exception 'Only % can hand this over.', public.owner_name(owner) using errcode = '42501';
  end if;

  perform set_config('picklr.hand_over', 'on', true);
  if p_kind = 'match' then
    update public.matches set created_by = p_to where id = p_id;
  elsif p_kind = 'session' then
    update public.sessions set created_by = p_to where id = p_id;
    update public.matches set created_by = p_to where session_id = p_id;
  else
    update public.tournaments set created_by = p_to where id = p_id;
    update public.matches set created_by = p_to where tournament_id = p_id;
  end if;
  perform set_config('picklr.hand_over', '', true);
end;
$$;

revoke execute on function public.hand_over, public.require_match_owner from public, anon;
grant execute on function public.hand_over, public.require_match_owner to authenticated;
grant execute on function public.owns, public.owner_name to anon, authenticated;
