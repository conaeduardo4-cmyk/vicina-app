Test dello schema su un PostgreSQL 16 locale (non serve per usare l'app).
`stubs.sql` simula le parti di Supabase (auth, storage, vault, pg_net, pg_cron); `test.py` prova sicurezza e flussi.
Database "t" su socket /var/tmp/vpg porta 5499: carica stubs.sql, poi schema.sql (senza le righe pg_net/pg_cron), poi `python3 test.py`.
