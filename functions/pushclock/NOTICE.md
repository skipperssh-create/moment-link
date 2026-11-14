`triggers.mjs` is the unmodified compiled trigger parser from `@neon/functions` 0.11.0, with an attribution comment added. Author: Neon. Source: https://github.com/neondatabase/neon-pkgs . Licensed under Apache-2.0 (included in LICENSE).

The relay uses no database credentials. Deploy index.mjs, triggers.mjs, NOTICE.md and LICENSE at the ZIP root. Set server-only PUSH_REPEAT_SECRET and PUSH_CLOCK_ENABLED=true. Create a Neon schedule trigger named `moment-link-unread-2min`, function slug `pushclock`, path `/tick`, cron `*/2 * * * *`. Never enable a child branch trigger against production.
