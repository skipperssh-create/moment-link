# Push reconnection after reinstall

2026-11-21

A device with no current subscription can display the reconnect instruction while both controls remain disabled. Reproduced by returning an unregistered device status, then leaving the next status request pending: the old client sets `busy=true` for this read and has no deadline for the server request.

- Read-only status refresh uses a separate checking state; the connect action stays available and still requests notification permission synchronously from the user's click.
- Status, subscription reads, registration writes and browser subscription operations have deadlines. Failed actions restore the controls and keep the reason in the device card.
- Revision guards prevent a stale status response from replacing a newer successful connection, or saving a subscription after logout/reset.
- Admin busy state changes repaint device controls. Service-worker shell cache advances to v136.
- Reinstall requires checking/reconnecting this device's subscription. A connection does not override Android permission, sound, Do Not Disturb or battery settings.

Validation in a Vercel cloud sandbox: 23 push/PWA/audio tests passed; syntax checks and build passed. Chromium exercised the admin page with synthetic authentication and intercepted push APIs: delayed status + reconnect, denied permission, failed subscription save. Widths 320, 390, 768, 884 and 1280 fit without horizontal overflow. These are viewport simulations, not physical foldable-device tests.

No production reservation, OPS conflict, push subscription or notification was changed/sent by the checks. Physical notification receipt and sound still require the user's phone.

## Permission response recovery after reinstall

The device screenshots show Android app notifications allowed while the web app remains at "checking notification permission". This identifies the waiting stage, but does not establish the underlying Android/Chrome cause. The prior client only waited for the original requestPermission promise, so a lost response could not recover from a later permission grant.

The client now observes Notification.permission, Permissions API change notifications and PushManager.permissionState while waiting. These read-only observations do not grant permission. A missing response stops after ten seconds with P01 and exposes "권한 재연결". That action invokes the browser's PushManager.subscribe directly in a fresh user click using the already prepared registration and public application key; the browser still enforces permission. A failed or stalled native subscription reports the reason/P02 and never reports success or retries automatically. Session reset invalidates outstanding work, and only this device's successful subscription is saved.

Cloud validation: 31 push/PWA/audio tests passed, syntax checks and build passed. Browser checks cover a granted permission with an unresolved original prompt, the native recovery click, browser denial, and native timeout. Recovery remains visible and within the viewport at widths 320/390/768/884/1280. Authentication and push APIs were synthetic/intercepted; no real notification or production subscription was created. Physical Android notification receipt remains unverified.
