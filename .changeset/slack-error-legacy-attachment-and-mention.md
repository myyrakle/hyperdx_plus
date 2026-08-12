---
"@hyperdx/api": minor
"@hyperdx/app": minor
---

Fix: the coloured state bar never appeared on Slack (Error) alerts. Slack ignores
`color` when an attachment's body is Block Kit `blocks`, so the message is now
built from legacy attachment fields (title / text / fields), which Slack does
colour — red while firing, green once resolved.

Add an optional broadcast mention to alerts: `@here` or `@channel`, chosen per
alert and rendered only by the Slack (Error) service. The mention goes in the
message's top-level text, since a broadcast inside an attachment does not
reliably notify. Resolutions never mention.
