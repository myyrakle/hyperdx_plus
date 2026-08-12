---
"@hyperdx/api": patch
---

Fix: Slack (Error) alerts printed their title twice — once as the message text
and again as the linked heading inside the attachment. The plain-text summary
moves to the attachment's `fallback`, which serves the same purpose for mobile
notifications without rendering a second line.

The footer link is now labelled `Open chart` / `Open search` instead of
`View chart` / `View search`.
