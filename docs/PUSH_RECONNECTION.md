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
