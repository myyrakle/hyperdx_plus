---
"@hyperdx/common-utils": minor
"@hyperdx/api": minor
"@hyperdx/app": minor
---

Add a "Notify only on state change" alert option. When enabled, a breach sends a
single notification and stays quiet while the alert remains open, instead of
re-notifying on every evaluation window. The resolution notification still goes
out, and a breach after that resolution notifies again. Suppression is tracked
per group for grouped alerts. Alerts without the option keep re-notifying every
window.
