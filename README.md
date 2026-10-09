# Picklr

Live scores, Elo ratings, sessions and tournaments for a small pickleball group.

- **Watchers** need no account: live scoreboards, ratings, player profiles, match history, brackets. Everything updates in real time.
- **Referees** sign in to create and score matches, run sessions and tournaments, and manage players. There can be several; each one controls only what they started (see [Multiple referees](#multiple-referees)).

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
- **Security is in the database.** Row-level security lets anyone read, and only users listed in `referees` write. Each match, session and tournament can only be changed by the referee who started it. Scoring uses RPCs that reject out-of-order rallies, so two devices can't silently overwrite each other. A trigger keeps an audit log.
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

1. **Supabase.** Create a free project at supabase.com. Then create the tables and seed the players. The project ref is the subdomain of your project URL (`https://<ref>.supabase.co`); `link` asks for the database password you chose when creating the project.
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --include-seed
   ```
   In the dashboard, go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Only the referee account should exist.
2. **Referee account.** Create a file named `.env.hosted` (git-ignored). Keep `.env.local` for local development. Put these in it:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...        # Project Settings → API Keys
   REFEREE_EMAIL=you@example.com
   REFEREE_PASSWORD=a-strong-password
   REFEREE_NAME=Your name
   ```
   Then run `npm run referee:create -- --env .env.hosted`. Repeat with other values for each extra referee.
3. **Vercel.** Import the GitHub repo at vercel.com and set two environment variables, using the same project as above:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Never add the secret key to Vercel; the app doesn't need it.

**"Could not find the table 'public.…' in the schema cache"** on the live site means step 1 hasn't been run against the project in Vercel's `NEXT_PUBLIC_SUPABASE_URL`. Run `npx supabase db push --include-seed` while linked to that project, then refresh. No redeploy is needed.

Free Supabase projects pause after about a week with no activity. Weekly play keeps the project active; if it does pause, resume it from the dashboard.

## Multiple referees

Any number of people can be referees. Each match, session and tournament belongs to the referee who started it, and only they can score it, edit or delete it, enter results, or add matches to it. Other referees see a read-only view with "Run by Dhruv". The database enforces this, not just the app.

- **Hand over:** if you have to leave, pass a match, session or tournament to another referee from its page. A session or tournament takes all its matches with it.
- **Shared:** the player list and rating settings can be edited by any referee.
- **Names:** each referee sets their display name under **Referee → Settings**. The change log shows who did what.

**Adding a referee.** Creating logins needs the secret key, so it's done from your computer, not the website. Edit the three `REFEREE_*` lines in `.env.hosted` (or `.env.local` for local development) and run the script again. Existing referees aren't affected.

```
REFEREE_EMAIL=gaurav@example.com
REFEREE_PASSWORD=their-password
REFEREE_NAME=Gaurav
```

```bash
npm run referee:create -- --env .env.hosted
```

Running it again with an existing email resets that referee's password (and name, if `REFEREE_NAME` is set).

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
