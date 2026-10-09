# Pickleball Elo

Live scores, Elo ratings, sessions and tournaments for a small pickleball group.

- **Watchers** need no account: live scoreboards, ratings, player profiles, match history, brackets. Everything updates in real time.
- **The referee** signs in to create and score matches, run sessions and tournaments, and manage players.

## Features

| | |
|---|---|
| **Elo ratings** | Separate singles and doubles ratings, updated after every match. Margin of victory counts, and new players move faster (provisional K). |
| **Live scoring** | Tap who won each rally. Side-out (with server 1/2 and "0-0-2") or rally scoring, games to 7/9/11/15/21, win by 1 or 2, single game or best of 3. Includes undo, score correction, game/match point, and "switch ends". |
| **Sessions** | Check in who showed up. The app suggests each next match: fair rotation, fresh partners, closest odds. Shows the day's standings and a shareable recap. |
| **Tournaments** | Single, double or triple round robin (optionally followed by a top-2/top-4 playoff), single elimination, or double elimination with a grand-final reset. Seeded by Elo, with byes going to the top seeds. Doubles teams can be balanced, snake-drafted, random, or fixed. |
| **Fair teams** | Pick any four players and see all three possible splits with win chances. |
| **Stats** | Rating charts, partners, toughest opponents, head-to-head, streaks, records, biggest upsets. |
| **Admin** | Edit results, archive (hide and stop rating; restorable) or permanently delete matches, cancel tournaments, rated/unrated matches, starting ratings, rating settings, change log, CSV export. |
| **Mobile** | Phone-first layout, installable to the home screen, and a TV scoreboard mode that keeps the screen awake. |

## How it works

- **Next.js 16 + Supabase (Postgres, Auth, Realtime).** Every browser loads the club's data once, then applies row changes pushed by Supabase Realtime.
- **Ratings are never stored.** Each client replays completed matches through the Elo engine (`src/lib/elo`). Editing a result, voiding a match, changing a starting rating, or tuning K therefore updates every rating, chart and streak consistently. For a group this size the replay takes milliseconds.
- **Security is in the database.** Row-level security lets anyone read and only users listed in `referees` write. Scoring uses RPCs that reject out-of-order rallies, so two devices can't silently overwrite each other. A trigger keeps an audit log.
- **Core logic is pure and unit-tested:** Elo, the scoring state machine, brackets and seeding, matchmaking, stats, and the tournament builder (`npm test`).

```
src/lib/elo          rating engine
src/lib/scoring      pickleball scoring state machine
src/lib/brackets     seeding, single/double elimination, round robin, standings
src/lib/matchmaking  fair pairings, team formation, session rotation
src/lib/stats        partners, rivals, upsets, form
src/lib/tournament   format + entries → linked match rows
src/lib/data         live data store, auth, referee actions
supabase/migrations  schema, RLS, RPCs, realtime
```

## Local development

Requires Node 24+ and Docker Desktop (running).

```bash
npm install
npm run db:start          # local Supabase in Docker (first run downloads images)
npm run db:reset          # apply the schema and seed players
cp .env.example .env.local
```

Fill `.env.local` with the values from `npx supabase status -o env` (`API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`), and choose a referee email and password. Then:

```bash
npm run referee:create
npm run dev               # http://localhost:3000
```

Local Supabase Studio is at http://127.0.0.1:54323.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploying for free (Supabase + Vercel)

1. **Supabase.** Create a free project at supabase.com. Then:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --include-seed
   ```
   In the dashboard, go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Only the referee account should exist.
2. **Referee account.** Put the project URL, publishable key and secret key (Project Settings → API Keys) plus your chosen `REFEREE_EMAIL` / `REFEREE_PASSWORD` in `.env.local`, then run `npm run referee:create`.
3. **Vercel.** Push this repo to GitHub and import it at vercel.com. Set two environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Never add the secret key to Vercel; the app doesn't need it.

Free Supabase projects pause after about a week with no activity. Weekly play keeps the project active; if it does pause, resume it from the dashboard.

## Starting ratings

`scripts/data/legacy.ts` holds the group's 1–10 player ratings and its pre-app list of winning pairs. `scripts/initial-ratings.ts` turns them into starting Elo ratings:

1. **Prior:** `1500 + 100 × (1–10 rating − average of active players)`. Players with no 1–10 rating start at the average of all rated players.
2. **History:** each recorded win counts as a win over an average (1500) team, with K = 12. The history has no losers or scores, so it nudges ratings rather than replays matches.
3. **Re-centre:** players who appear in the history are shifted so their average is unchanged. Everyone else keeps their prior, because not being on a winners list says nothing about someone who wasn't there.

To change the inputs, edit `legacy.ts`, then run `npm run ratings:initial` (this regenerates `supabase/seed.sql`). The referee can also adjust any starting rating in the app under **Referee → Players**; the whole history is replayed.

Assumptions in the current data:

- "Manu" in the ratings list is **Manoj** from the win history.
- **Monty, Gunjan, Swastik and Ashish** appear only in the history. They are added as inactive players.

## Rating settings

The defaults can be changed under **Referee → Settings**:

- Everyone starts at 1500.
- K = 40 for a player's first 10 matches of each kind, then 24.
- Margin of victory is on, scaled so an 11–6 win counts ×1.
- Players are ranked from their first match.
