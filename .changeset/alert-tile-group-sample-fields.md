---
"@hyperdx/api": minor
"@hyperdx/app": minor
---

Extend the `Slack (Error)` service to dashboard tile alerts. Tile alerts now get
the same structured layout, `displayFields` from a representative row of the
group that fired, and a group-scoped filter on their sample-row query. The alert
title links to the row list for that group; the tile's chart stays reachable from
the message footer.

Raw SQL and PromQL tiles keep the plain layout — their predicate cannot be
reproduced as a row query.
