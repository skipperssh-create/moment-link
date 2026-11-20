# Phone notification diagnostics D01

P01 means Notification.requestPermission did not return an answer within our deadline. P02 means the native subscription call did not finish within our deadline. Neither is a Samsung or Chrome error code, and neither by itself proves permission was denied.

Open /?push-diagnostic=1#admin on the affected phone (sign in if needed), or press 알림 진단. The admin card shows the actual browser/version, installed mode, Notification permission, Permissions API state, service-worker readiness, PushManager permission, subscription presence and server configuration. SamsungBrowser is detected before Chrome.

Each read has a 2-second deadline; one stalled read cannot hide the other results or disable connection. Diagnostics never request permission, create/delete subscriptions, send notifications, or write reservations. No endpoint, keys, credentials, raw user agent, or customer data is displayed, stored, or sent by diagnostics. Results remain only in page memory and clear on logout/reset. Server status uses the existing authenticated GET.

Cloud tests simulate browser states and check phone-width layouts; they do not reproduce Samsung Internet's native permission prompt. A physical phone result is still required before claiming the reinstall issue resolved.
