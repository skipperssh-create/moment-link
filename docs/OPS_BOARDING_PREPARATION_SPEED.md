OPS registration and boarding message preparation

Atomic-v1 BOATN registration validates payment/add-ons authoritatively and optionally returns the committed boarding invitation. Moment no longer makes redundant advisory metadata calls for that negotiated route; legacy and other OPS adapters retain their preflight checks.

After registration succeeds, the worker locks only that consultation and validates invitation booking ID, recipient, departure, party size, context and URL. It appends the boarding block to the existing edited draft in the same completion transaction. Missing, mismatched, long or obsolete invitations use the existing preparation path; a committed booking is not retried because a message could not be prepared.

The read-only observation endpoint returns only a whitelisted prepared-message handoff tied to the exact base version and job ID. The UI accepts that single version increment, preserving all other consultation data. Concurrent staff/local edits stop automatic handoff. Opening the SMS composer and marking manual send still require fresh OPS verification. No send or delivery record is created by preparing the draft.

Cloud validation: isolated database route tests, synthetic UI tests, legacy fallback, malformed/cross-booking invitation rejection, guarded concurrent changes and full checks. Production timing is recorded separately after deployment, using synthetic records only.
