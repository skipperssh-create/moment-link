# Automatic in-page voice alerts

2026-11-07

- An authenticated administrator or counselor starts with voice alerts enabled on every page load. Login/password-change requirements still gate activation.
- Turning alerts off affects the current open page. Ordinary rerenders preserve that choice; reload, reopening or a fresh authenticated session enables them again.
- Opening the page does not announce a nonexistent consultation. Existing polling still ignores its initial baseline and duplicate arrivals.
- The first trusted click/key interaction can prime the existing audio element silently. A browser autoplay rejection preserves the enabled preference and queues one pending arrival for an interaction. Gesture recovery is bounded to two attempts; manual preview remains available.
- Hidden pages stop playback. Logout clears pending notifications and invalidates stale audio callbacks. No new storage, external speech service, notification subscriptions or customer data transmission is introduced.
- Browser autoplay is controlled by the browser. See [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/) and [WebKit media autoplay guidance](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/).

Validation: 139 automated tests passed; 29 public files built. Synthetic browser checks verified login defaults to on, manual off persists in that page, refresh resets to on, a newly opened page is on while the older page remains off, and preview playback returns to the on state. Mobile width 390 px had no page overflow. No real consultation, OPS job or SMS was changed. Physical speaker output and platform-specific Safari/PWA policies were not independently verified.
