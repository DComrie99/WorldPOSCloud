# WorldPOS Cloud

Initial proof of concept for the browser-based WorldPOS Cloud back office.

## Included

- Supabase email/password authentication
- Site-scoped dashboard
- Staff setup
- Terminal setup
- Administrator, manager and read-only roles
- PostgreSQL Row Level Security for every exposed table

## Local development

Copy `.env.example` to `.env.local`, add the public Supabase project URL and
publishable key, then run:

```sh
pnpm install
pnpm dev
```

Database changes are maintained as immutable migrations under
`supabase/migrations`. Apply them only through the Supabase migration workflow.

The oldest Auth user present when the initial migration is applied is assigned
the POC administrator role and the demo site. All later Auth users start as
read-only and require an administrator-assigned site membership.
