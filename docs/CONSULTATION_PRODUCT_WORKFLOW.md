# Consultation product and additional purchases

Implemented 2026-11-07.

- Before confirmation, the assigned counselor or an administrator can change the yacht/product, package and catalog options in the consultation detail screen.
- Selecting a different product recalculates the date-specific base price. Additional purchases remain separate and are added once. Explicit manual quotes are supported after selection.
- Bouquet, custom-priced bouquet, fireworks, cake and wine purchases are visible below the booking fields. Quantity and editable sale prices are saved with the booking.
- **예약사항 저장** saves the draft without confirming the reservation, registering with OPS or preparing/sending a message. A changed product must be saved before confirmation or message preparation.
- Product changes retain the assigned counselor, intake preferences, customer request, saved notes and message history. The original catalog snapshot is retained for reference; schedule/payment approval is reset for review.
- The detail screen follows booking information → notes/ownership → confirmation → messages. Section links remain available while scrolling. Composer rerenders preserve the actual note editor node and its unsaved text.
- Confirmed, cancelled/completed and OPS-linked records cannot change products through this endpoint. Existing OPS conflicts are neither edited nor retried. Confirmed additional purchases continue to use the existing dedicated OPS update path.

## Verification

- 130 automated tests passed, including seven new product/workflow assertions and existing ownership, pricing, messages, additional purchases and OPS regressions.
- Build produced 28 allowlisted public files. No migration or production booking mutation was required.
- Browser verification used synthetic local data: product/package change, bouquet plus cake, draft save/reopen, memo preservation and save, weekday recalculation, message total, confirmed product lock and visible purchase controls.
- Responsive browser sizes: 320×760, 760×320, 390×844, 844×390, 750×1000, 1000×750, 820×1180, 1180×820 and 1440×900. No page overflow; expanded ownership controls were also checked at 320 px.
- Actual phones, real customer messages and real OPS reservations were not modified for testing.
