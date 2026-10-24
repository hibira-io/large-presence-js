# @hibira-io/large-presence

[![npm](https://img.shields.io/npm/v/@hibira-io/large-presence)](https://www.npmjs.com/package/@hibira-io/large-presence)
[![ci](https://github.com/hibira-io/large-presence-js/actions/workflows/ci.yml/badge.svg)](https://github.com/hibira-io/large-presence-js/actions/workflows/ci.yml)

A [pusher-js](https://github.com/pusher/pusher-js) and Laravel Echo helper
for **large presence channels** (`presence-large-*`, up to 100,000 members)
on [Hibira](https://hikibi.io).

Regular presence channels send every subscriber the full member list and one
event per join and leave, which stops working past a few hundred members.
In a large presence channel, subscribers get the member count plus a sample
of members. After that they get one `pusher:members_delta` event per second
with the batched joins and leaves. pusher-js doesn't apply these deltas
itself. This helper keeps `count` and a bounded map of known members up to
date for you.

## Install

```sh
npm install @hibira-io/large-presence pusher-js
```

Coming from `@hikibi/large-presence`? Hikibi is now Hibira and the package
was renamed; the API is the same. Swap the dependency and change the import to
`@hibira-io/large-presence`.

## Usage

```js
import Pusher from 'pusher-js';
import { LargePresence } from '@hibira-io/large-presence';

const pusher = new Pusher(key, {
  wsHost,
  forceTLS: true,
  channelAuthorization: { endpoint: '/broadcasting/auth' },
});

const room = LargePresence.subscribe(pusher, 'presence-large-live.42', {
  maxMembers: 1000, // members kept locally
  fetchMembers: (cursor) => // optional, see "Paging members"
    fetch(`/live/42/members?cursor=${encodeURIComponent(cursor)}`).then((r) => r.json()),
});

room.on('ready', ({ count }) => console.log('viewers', count));
room.on('change', ({ count, joined, left, added, removed }) =>
  console.log(`+${joined} −${left} → ${count}`));

room.count;            // members in the whole room
room.members;          // Map<user_id, user_info> of known members
room.me;               // { id, info }
await room.loadMore(); // next page of members; true while more remain
room.unsubscribe();
```

### Laravel Echo

```js
const room = new LargePresence(Echo.join('large-live.42').subscription);
```

`Echo.join('large-live.42')` subscribes to `presence-large-live.42`, and
authorization works like any presence channel:

```php
// routes/channels.php
Broadcast::channel('large-live.{id}', fn ($user, $id) => ['name' => $user->name]);
```

Create the `LargePresence` right after subscribing so no delta is missed.

### Paging members

The subscription only carries a sample of members (the first 100 to join,
plus yourself). To list more, your backend pages through
`GET /apps/{app_id}/channels/{channel}/users?limit=500&cursor=…`. This is a
signed API request, so the browser can't make it directly. `fetchMembers(cursor)`
must return that endpoint's JSON:

```json
{"users":[{"id":"u1","user_info":{"name":"…"}}],"count":100231,"next_cursor":"MTcy…"}
```

For example, with the Pusher PHP SDK:

```php
Route::get('/live/{id}/members', fn (Request $r, $id) => app(Pusher::class)->get(
    "/channels/presence-large-live.$id/users",
    ['limit' => 500, 'cursor' => $r->query('cursor', '')],
));
```

## API

| | |
|---|---|
| `LargePresence.subscribe(pusher, channelName, options?)` | Subscribes and wraps the channel. |
| `new LargePresence(channel, options?)` | Wraps a channel you already subscribed to. |
| `options.maxMembers` | Members kept locally (default 1000). The oldest known members are forgotten first. |
| `options.fetchMembers(cursor)` | Loads one page of members through your backend. |
| `count` | Member count of the whole room (`null` until subscribed). |
| `members` | `Map` of known members, `user_id → user_info`. |
| `me` | `{ id, info }` for the current user. |
| `ready` | `true` once the subscription succeeded. |
| `on('ready', fn)` | `fn({ count, members })` after subscribing. Returns a function that removes the listener. |
| `on('change', fn)` | `fn({ count, joined, left, added, removed })` for each delta. |
| `on('error', fn)` | Errors from `fetchMembers`. |
| `loadMore()` | Loads the next page of members. Resolves to `true` while more remain. |
| `unsubscribe()` | Unbinds and unsubscribes. |

TypeScript types are included.

## What a delta contains

```json
{"count":100543,"joined":312,"left":40,
 "added":[{"user_id":"u9","user_info":{"name":"…"}}],"removed":["u4"]}
```

- `count` is the authoritative member count of the room.
- `joined` and `left` are exact totals for the batch. A member who joined and
  left within one batch counts in both.
- `added` names at most 10 members and `removed` at most 50, so each delta
  stays small however busy the room is.
- Client events (`client-*`) are refused on large presence channels, because
  one whisper would reach the whole room.

## Development

```sh
npm test
```

Releases are published to npm from GitHub Releases. Bump `version` in
`package.json`, add a `CHANGELOG.md` entry, merge, then publish a release
tagged `v<version>`.

## License

[MIT](LICENSE)
