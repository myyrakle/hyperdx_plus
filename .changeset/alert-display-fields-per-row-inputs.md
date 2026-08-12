---
"@hyperdx/api": minor
"@hyperdx/app": minor
---

Alert display fields are now asked for by role rather than as a free-form list of
expressions: named slots for the error message and the stack trace, plus
repeatable extra fields with optional labels. Each slot's layout is fixed — the
stack trace always renders as a full-width code block, everything else as a
two-column field — so a notification looks the same regardless of what the values
contain. This replaces the previous heuristic that decided the layout from
whether a value happened to contain a newline.
