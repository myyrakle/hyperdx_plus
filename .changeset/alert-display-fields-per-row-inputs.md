---
"@hyperdx/api": minor
"@hyperdx/app": minor
---

Alert display fields are now edited one row at a time instead of as a single
comma-separated expression, with an optional per-row label. Storage changed from
a comma-separated string to an array of `{ valueExpression, alias }`; the label
falls back to one derived from the expression when left blank.
