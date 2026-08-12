---
"@hyperdx/api": patch
---

Fix: alert display fields always rendered empty. ClickHouse names an unaliased
`SpanAttributes['x']` column `arrayElement(SpanAttributes, 'x')`, so reading the
response by expression text never matched. The representative-row query now
aliases each display field and reads those aliases back.
