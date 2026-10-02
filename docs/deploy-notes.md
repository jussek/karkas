# Deployment notes

Vercel Hobby rejects cron expressions that execute more than once per day. Keep fast online-match automation client-triggered while on Hobby, and use `/api/online/match/cron` only with a Pro cron or an external scheduler.

If a deployment fails before a deployment record appears, inspect `vercel.json` first for unsupported plan-level configuration.
