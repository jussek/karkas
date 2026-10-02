# Online architecture (Stage 5A)

`src/game/**` remains the authoritative, deterministic TypeScript domain and has no browser, React, storage, Supabase, or Realtime dependencies. `src/online/**` owns identity, DTO conversion, lobby persistence, and subscriptions. Local session configuration and online lobby/match references are intentionally separate types.

Supabase anonymous Auth `user.id`, never a display name or `user_metadata`, is the network identity. PostgreSQL constraints and row-level security are authoritative; Realtime only invalidates/refetches a lobby snapshot and never grants access.

Stage 5A does **not** synchronize gameplay JSON. Stage 5C must use a server-authoritative protocol: a client submits an intent/action; the server validates state version, actor, and turn; the pure engine applies the accepted action; the server persists the authoritative state/version; Realtime announces the accepted result. A peer's client state is never accepted as truth.

Lobby creation, joining, leaving, and setting changes use narrowly scoped database functions so multi-row operations and seat assignment are atomic. Client table privileges prevent changing identity or seat columns, while RLS limits lobby reads and ready updates by authenticated membership/ownership. Every UI subscription must retain and call the returned cleanup function on unmount.

## Authoritative matches (Stage 5D.1)

The browser sends only a typed intent plus an expected version and idempotency UUID to Vercel server functions. Those functions validate the Supabase bearer token, derive the actor from Auth, apply the intent through the existing `TurnFlow` APIs, and commit the private state, whitelisted public snapshot, version, and action log through one service-role-only database transaction. The service-role client lives exclusively under `api/`; client code can only read participant-scoped public match rows.

`online_match_states` contains the serialized authoritative flow, including its seed and future decks, and is neither selectable by authenticated users nor published to Realtime. `online_matches.snapshot` is built field-by-field and contains only board/rendering state and derived legal options. Realtime publishes only the public match row and acts as an invalidation signal; clients refetch through RLS.
