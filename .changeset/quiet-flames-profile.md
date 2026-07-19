---
"@hyperdx/api": patch
"@hyperdx/app": patch
"@hyperdx/common-utils": patch
---

Add a team-scoped Continuous Profiling tab that embeds Pyroscope's query UI through an authenticated, read-only HyperDX proxy. Profiling connection settings support connection tests, tenant headers, and server-managed Basic or Bearer credentials while profile storage remains in Pyroscope. The embedded UI inherits HyperDX's light or dark color scheme.
