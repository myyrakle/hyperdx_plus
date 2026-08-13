---
"@hyperdx/api": patch
---

Fix: a display field the representative row has no value for is now omitted
instead of rendering as a labelled empty block. A span that timed out carries no
stack trace, which left an empty code block in the notification.
