---
"@hyperdx/api": patch
---

Fix: an alert's `@here` / `@channel` mention never reached Slack. The view handed
to the notification layer is assembled field by field, and `mention` was not
among the fields copied, so it always read as unset.
