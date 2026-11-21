# Phone notification diagnostics D01

P01 means Notification.requestPermission did not return an answer within our deadline. P02 means the native subscription call did not finish within our deadline. Neither is a Samsung or Chrome error code, and neither by itself proves permission was denied.

Open /?push-diagnostic=1#admin on the affected phone (sign in if needed), or press 알림 진단. The admin card shows the actual browser/version, installed mode, Notification permission, Permissions API state, service-worker readiness, PushManager permission, subscription presence and server configuration. SamsungBrowser is detected before Chrome.

Each read has a 2-second deadline; one stalled read cannot hide the other results or disable connection. Diagnostics never request permission, create/delete subscriptions, send notifications, or write reservations. No endpoint, keys, credentials, raw user agent, or customer data is displayed, stored, or sent by diagnostics. Results remain only in page memory and clear on logout/reset. Server status uses the existing authenticated GET.

Cloud tests simulate browser states and check phone-width layouts; they do not reproduce Samsung Internet's native permission prompt. A physical phone result is still required before claiming the reinstall issue resolved.

## Notification controls layout — 2026-11-21

Connection, test and diagnostics now share one action group. Narrow cards use three equal-width buttons; when permission repair is available, all four actions use a balanced two-column grid. Cards with at least 600px of content width place the group beside the status copy, in one row. Diagnostic results remain below the group and appear only after diagnosis. Hidden repair controls and disabled states remain intact.

Cloud verification: 19 browser checks across 320, 360, 390, 549, 768, 844, 884, 1024 and 1440px widths, including portrait/landscape, repair visible/hidden, diagnostic expansion and disabled controls. All 26 existing push-device/PWA tests, JavaScript syntax, diff whitespace checks and the 54-file build passed. Browser checks use synthetic admin/push responses; no production login, reservation changes, subscription changes or notification delivery. This verifies responsive layout, not physical handset rendering.
