---
"@hyperdx/api": minor
"@hyperdx/app": minor
---

Add a `Slack (Advanced)` webhook service that renders alerts as structured Block
Kit blocks, plus an alert `displayFields` setting that pulls arbitrary columns
(error message, stack trace, …) from a representative row of the group that
fired. Grouped saved-search alerts also gain a link that opens the search scoped
to that group.

Fix: sample rows attached to a grouped saved-search alert were taken from the
whole search rather than the alerting group, so they could show unrelated rows.
They are now filtered to the group for every notification channel.
