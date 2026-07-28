# HyperDX Web App Internationalization Design

**Date:** 2026-07-22

## Goal

Introduce an internationalization foundation for the entire HyperDX web app in
`packages/app`. Move all frontend-owned English UI copy into translation
catalogs while preserving English as the default language. Users can explicitly
select Korean in Preferences, and reviewed Korean translations can then be
added one key at a time. Missing Korean translations render the English source
copy.

This change establishes the translation system and migrates the complete web UI;
it does not attempt to choose Korean translations in bulk.

## Requirements

- Support `en` and `ko` in the web app.
- Keep English as the default for new and existing users.
- Never infer a locale from the browser, request headers, or operating system.
- Let users change the locale explicitly in Preferences.
- Store the selection only in the existing `hdx-user-preferences` local storage
  record. Do not add an API or account-level preference.
- Keep existing URLs unchanged; do not add locale prefixes or locale-aware
  routing.
- Move all frontend-owned, user-visible English UI copy into catalogs.
- Treat the English catalog as the complete source of truth.
- Allow the Korean catalog to be incomplete and fall back to English per key.
- Keep user data, telemetry data, query syntax, and API error details unchanged.

## Chosen Approach

Use `i18next` with `react-i18next`, initialized once at the application root.
This provides React integration, interpolation, plural handling, rich messages,
namespaces, and first-class language fallback without building those facilities
locally.

The alternatives considered were:

- `react-intl`, which provides strong ICU message support but adds more message
  descriptor boilerplate across a large existing UI.
- A custom React context and TypeScript dictionaries, which minimizes
  dependencies but would require custom implementations of pluralization,
  interpolation, rich content, missing-key diagnostics, and tooling.

Next.js internationalized routing is intentionally not used. Locale selection is
a client preference rather than a property of the URL, and the ClickStack static
export must continue to work without locale-specific routes.

## Architecture

Create a focused `packages/app/src/i18n/` module:

- `config.ts` defines supported locales, the default locale, and fallback
  behavior.
- `index.ts` owns the single i18next instance and React integration.
- `types.ts` exposes the locale and catalog key types.
- `I18nProvider.tsx` synchronizes the selected preference with i18next and the
  document language.
- `useLocale.ts` provides the small public interface for reading and changing
  the locale.
- `locales/en/` contains the complete English catalogs.
- `locales/ko/` contains only reviewed Korean entries.

Catalogs are split into bounded feature namespaces rather than one large file.
The initial namespace set should follow actual code ownership and include at
least `common`, `navigation`, `auth`, `dashboards`, `search`, `charts`, `alerts`,
`sessions`, `settings`, `sources`, and `profiling`. Additional namespaces are
allowed when an existing feature does not fit one of these boundaries.

The English catalog defines the valid keys and interpolation parameters. Korean
catalogs are typed as partial counterparts. Validation rejects Korean keys that
do not exist in English and translations whose interpolation placeholders differ
from the English message.

React components use `useTranslation(namespace)`. Code that legitimately
creates UI copy outside a component uses the initialized application i18next
instance. Domain constants, API values, analytics event names, and persistence
values must remain language-neutral and must not call the translator.

## Locale Preference and Rendering Flow

Add `locale: 'en' | 'ko'` to `UserPreferences` and set it to `en` in the default
preferences. Extend the existing preference validation and migration so stored
records from any older shape receive `locale: 'en'`, while valid stored locale
values are preserved. Invalid locale values also resolve to `en`.

The application initializes i18next in English so server rendering and the first
client render agree. After the Jotai-backed preference hydrates from local
storage, `I18nProvider` changes the active i18next locale if needed. Changing the
Preference selector updates both the Jotai preference and the rendered UI
without a page reload.

The provider sets `document.documentElement.lang` to the active locale. The
value returns to `en` if preference storage cannot be read or contains an
unsupported value.

Locale resources are bundled with the app. No translation network request,
loading screen, or remote translation service is introduced.

## Translation Catalog and Review Workflow

Use stable semantic keys, scoped by namespace. Do not use English sentences as
keys. For example:

```tsx
const { t } = useTranslation('dashboards');

t('list.createButton');
t('delete.confirmation', { name: dashboard.name });
```

Every migrated key has an English entry. A reviewer adds the matching entry to
the Korean namespace only after approving the wording. When the Korean entry is
absent, `fallbackLng: 'en'` displays the English text. Missing translation keys
are logged only in development; key names and diagnostic markers are never
shown to users.

Simple variable content uses i18next interpolation. Sentences containing React
elements such as links or emphasis use `Trans`, keeping the message whole so a
translation can change word order. UI sentences must not be assembled by
concatenating translated fragments.

## String Migration Scope

The migration includes all frontend-owned user-facing text in `packages/app`,
including:

- page and browser-tab titles;
- navigation labels, headings, buttons, menus, labels, and descriptions;
- placeholders, tooltips, empty states, confirmation dialogs, and notifications;
- frontend-authored validation and generic failure copy;
- `aria-label`, user-facing `title`, and image alternative text;
- human-readable statuses, units, and date/number framing copy;
- frontend-owned option labels whose underlying values remain stable.

The following stay untranslated:

- user-authored names, descriptions, dashboard titles, and tags;
- log, trace, metric, profile, and session data;
- SQL, PromQL, field names, attribute names, URLs, and code examples where the
  exact syntax matters;
- brand names and technical proper nouns unless a later translation decision
  explicitly changes them;
- enum values, API payload values, storage keys, telemetry attributes, and
  analytics event names;
- raw or detailed error messages returned by the API or third-party systems.

Frontend-authored generic messages such as an operation failing are cataloged,
but an attached server error detail remains verbatim.

## Date, Time, Number, and Component Localization

The selected locale is passed to user-facing date and number formatters without
changing the existing UTC and 12/24-hour preferences. Formatting utilities
should accept or derive the active locale through one shared boundary rather
than reading browser locale implicitly.

Mantine date components and other third-party UI with explicit locale support
receive the same selected locale. Technical timestamps or serialized values sent
to APIs remain unchanged.

## Failure Behavior

- No locale or an unsupported locale: use English.
- Local storage unavailable or malformed: use English and keep the app usable.
- Korean key absent: use the corresponding English entry.
- English key absent: log a development diagnostic and fail catalog validation.
- Korean key or placeholder not represented in English: fail catalog
  validation.
- Translation initialization: never block application rendering on I/O because
  resources are bundled.

## Verification

Add automated coverage for:

- preference migration from legacy records to `locale: 'en'`;
- preservation of valid stored locales and rejection of invalid locales;
- locale switching, persistence, immediate rerendering, and `<html lang>`;
- English default behavior and per-key Korean-to-English fallback;
- catalog key validity and interpolation placeholder parity;
- representative common navigation and major page rendering in both locales;
- third-party date UI and shared formatter locale propagation.

Add a static source audit for newly introduced user-facing literals. It should
target JSX text and common user-facing props while maintaining an explicit,
reviewable allowlist for technical literals, brand names, fixtures, tests, and
other intentional exceptions. The initial full migration combines this audit
with a manual search so that strings in unusual code paths are not silently
missed.

After all edits, run the repository-required formatter/linter and verification:

1. `yarn lint:fix`
2. App unit tests covering the new i18n behavior and affected components
3. `make ci-lint`
4. `make ci-unit`

## Completion Criteria

The work is complete when:

- every in-scope frontend-owned English string is represented by an English
  catalog key;
- selecting Korean is possible only through Preferences and persists locally;
- Korean can be incrementally populated without changing component code;
- missing Korean entries display English without visible diagnostics;
- routes, API contracts, user content, technical values, and server error
  details retain their current behavior;
- catalog validation, static string audit, tests, lint, and type checks pass;
- a changeset records the user-facing behavior change for `@hyperdx/app`.
