# Online match automation

Stage 5D.3 exposes `POST /api/online/match/pump`. An authenticated match
participant may submit `{ "matchId": "..." }`; the server independently checks
whether the current player is a bot or the server deadline has elapsed.

Active clients request this endpoint at the deadline and during bot turns. The
deployment also configures Vercel Cron as an optional safety net at Vercel's
reliable one-minute cadence (`* * * * *`). Vercel calls
`GET /api/online/match/cron` and authenticates it with
`Authorization: Bearer $CRON_SECRET`; that adapter batch-processes at most 20
due matches. `CRON_SECRET` and `MATCH_AUTOMATION_SECRET` are server-only and
must never use a `VITE_` prefix. The one-minute cron is deliberately not
advertised as a five-second scheduler: active clients remain the fast path.

External schedulers may instead call `POST /api/online/match/pump` with
`x-karkas-automation-secret`. An empty JSON body selects a bounded due batch; a
body with `matchId` processes only that match. Configure URLs and secrets in the
deployment platform, never in a migration or source control.

Concurrent workers are safe because every automated transition uses the same
version-checked, row-locked commit RPC as human actions. The participant request
cannot choose an intent or force a human turn to end before its deadline.
