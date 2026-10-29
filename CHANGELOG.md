# Changelog

## 0.1.2

The package homepage on npm now links to https://hibira.io. No code changes.

## 0.1.1

Renamed for the Hikibi → Hibira rebrand. No API changes.

- Published as `@hibira-io/large-presence` (was `@hikibi/large-presence`); the
  repository is now github.com/hibira-io/large-presence-js. Replace the
  dependency and the import path; `@hikibi/large-presence` 0.1.0 stays on npm,
  deprecated, and gets no new versions.

## 0.1.0

First release: `LargePresence` for pusher-js and Laravel Echo, with the member
count, a bounded map of known members, batched `pusher:members_delta`
updates and paging through `loadMore()`.
