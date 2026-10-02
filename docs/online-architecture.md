# Online architecture (Stage 5A)

`src/game/**` remains the authoritative, deterministic TypeScript domain and has no browser, React, storage, Supabase, or Realtime dependencies. `src/online/**` owns identity, DTO conversion, lobby persistence, and subscriptions. Local session configuration and online lobby/match references are intentionally separate types.

Supabase anonymous Auth `user.id`, never a display name or `user_metadata`, is the network identity. PostgreSQL constraints and row-level security are authoritative; Realtime only invalidates/refetches a lobby snapshot and never grants access.

Stage 5A does **not** synchronize gameplay JSON. Stage 5C must use a server-authoritative protocol: a client submits an intent/action; the server validates state version, actor, and turn; the pure engine applies the accepted action; the server persists the authoritative state/version; Realtime announces the accepted result. A peer's client state is never accepted as truth.

Lobby creation, joining, leaving, and setting changes use narrowly scoped database functions so multi-row operations and seat assignment are atomic. Client table privileges prevent changing identity or seat columns, while RLS limits lobby reads and ready updates by authenticated membership/ownership. Every UI subscription must retain and call the returned cleanup function on unmount.
