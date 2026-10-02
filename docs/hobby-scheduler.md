# Hobby scheduler note

The production game does **not** declare a Vercel Cron schedule in `vercel.json` while the project is on Vercel Hobby. Hobby deployments reject cron expressions that run more than once per day, while the online match runtime requires a much faster safety net to be useful.

Active clients continue to call the authenticated participant pump for bot and timeout progression. The protected `/api/online/match/cron` endpoint remains available for a future Pro cron or an external scheduler. `CRON_SECRET` stays server-only.

Do not restore `* * * * *` on Hobby: it prevents the deployment from being created.
