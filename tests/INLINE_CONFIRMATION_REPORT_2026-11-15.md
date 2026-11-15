# Inline reservation confirmation verification

- Added the missing full-payment control to the list card confirmation form. It fills the current total and payment checkbox; the user still submits confirmation explicitly.
- Missing/invalid fields and API errors show an alert and feedback immediately above the confirmation buttons. Failed writes preserve entered values. Unknown outcomes are not retried automatically.
- Narrow forms stack total and received inputs so the amount and full-payment control remain readable.
- Automated tests: 220 passing, including missing receipt, full payment, edited total, partial payment, native validation, conflicts, unknown results and duplicate-submit prevention.
- Syntax checks and public build passed (45 public files).
- Local synthetic browser: blank receipt raised an alert; full payment filled 390,000; confirmation saved; reload retained received 390,000 and balance 0. The browser control after dismissing the native alert did not act on clicks; stopped after two attempts and verified the successful save in a fresh local tab.
- Responsive browser simulation: 360 x 780 and 760 x 900, no horizontal input/button overflow. Not a physical phone test.
- No production reservation updates, SMS, or OPS conflict changes were performed for verification.
