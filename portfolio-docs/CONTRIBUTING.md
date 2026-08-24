# Safe contributor notes

This mirror is view-only under the repository license. For local evaluation,
copy only the supplied `env.example` files, use local disposable services, and
never commit environment files or credentials.

Database migrations are append-only. Do not edit an existing migration. Demo
seeding is separate, restricted to local hosts, and requires a unique
`DEMO_ADMIN_PASSWORD`; there is no database reset command.

Preserve explicit tenant scoping, purpose-specific capabilities,
commit-before-publish events, and the term **settled externally**. Crowbar does
not process payment in this MVP.
