---
"@hyperdx/api": minor
"@hyperdx/app": minor
---

Add a `Slack (Error)` webhook service for error triage. It renders alerts as
structured Block Kit blocks inside a colour-coded attachment — red while firing,
green once resolved — and supports a new alert `displayFields` setting that pulls
arbitrary columns (error message, stack trace, …) from a representative row of
the group that fired. Grouped saved-search alerts also gain a link that opens the
search scoped to that group.

Fix: sample rows attached to a grouped saved-search alert were taken from the
whole search rather than the alerting group, so they could show unrelated rows.
They are now filtered to the group for every notification channel.

Fix: `postMessageToWebhook` dropped `attachments`, so any Slack payload relying
on them was delivered without them.
