---
"@hyperdx/app": minor
---

Client Sessions now has the same facet filter sidebar as Search. Sessions could
previously only be narrowed by typing a query into the search bar, so pinning
something like an environment or a service meant retyping it every visit. Values
are now clickable — include, exclude, or "only" — and the selection lives in the
URL, so a refresh or a shared link keeps it. Fields and values can be pinned to
the top of the sidebar for yourself or shared with your team, reusing the pins
already set up on the Search page for the same source. Filters narrow the session
list only; opening a session still shows all of its events.

The values offered are restricted to spans that belong to a browser session, so
a trace table shared with server spans no longer suggests services that can never
match a session.
