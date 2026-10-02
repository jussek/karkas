# Online match automation

Stage 5D.3 exposes `POST /api/online/match/pump`. An authenticated match
participant may submit `{ "matchId": "..." }`; the server independently checks
whether the current player is a bot or the server deadline has elapsed.

Production should also call the endpoint every **5 seconds** as a safety net.
The scheduler sends `x-karkas-automation-secret` with the server-only
`MATCH_AUTOMATION_SECRET`. An empty JSON body processes at most 20 due matches;
a body with `matchId` processes only that match. Configure the URL and secret in
the deployment scheduler, never in a migration or a `VITE_` variable.

Concurrent workers are safe because every automated transition uses the same
version-checked, row-locked commit RPC as human actions. The participant request
cannot choose an intent or force a human turn to end before its deadline.
