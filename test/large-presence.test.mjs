import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LargePresence } from '../index.js';

// A stand-in for a pusher-js channel: bind/unbind plus a way to emit.
function fakeChannel(name = 'presence-large-room') {
  const handlers = new Map();
  return {
    name,
    bind(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev).add(fn);
    },
    unbind(ev, fn) {
      handlers.get(ev)?.delete(fn);
    },
    emit(ev, data) {
      for (const fn of handlers.get(ev) ?? []) fn(data);
    },
    handlers,
  };
}

test('snapshot then deltas keep count and known members', () => {
  const ch = fakeChannel();
  const room = new LargePresence(ch);
  const ready = [];
  const changes = [];
  room.on('ready', (e) => ready.push(e));
  room.on('change', (e) => changes.push(e));

  ch.emit('pusher:subscription_succeeded', { members: { a: { n: 1 }, me: null }, count: 100000, myID: 'me' });
  assert.equal(room.count, 100000);
  assert.equal(room.members.size, 2);
  assert.deepEqual(room.me, { id: 'me', info: null });
  assert.equal(ready.length, 1);

  // pusher-js passes event data already parsed; strings are accepted too.
  ch.emit('pusher:members_delta', { count: 100002, joined: 3, left: 1, added: [{ user_id: 'b', user_info: { n: 2 } }], removed: ['a'] });
  ch.emit('pusher:members_delta', JSON.stringify({ count: 100003, joined: 1, left: 0, added: [], removed: [] }));
  assert.equal(room.count, 100003);
  assert.equal(room.members.has('a'), false);
  assert.deepEqual(room.members.get('b'), { n: 2 });
  assert.equal(changes.length, 2);
  assert.equal(changes[0].joined, 3);
});

test('known members are capped, oldest first, never yourself', () => {
  const ch = fakeChannel();
  const room = new LargePresence(ch, { maxMembers: 3 });
  ch.emit('pusher:subscription_succeeded', { members: { me: null, x: null }, count: 2, myID: 'me' });
  ch.emit('pusher:members_delta', { count: 5, joined: 3, left: 0, added: ['p', 'q', 'r'].map((u) => ({ user_id: u, user_info: null })), removed: [] });
  assert.deepEqual([...room.members.keys()], ['me', 'q', 'r']);
});

test('loadMore pages through fetchMembers until the last page', async () => {
  const ch = fakeChannel();
  const cursors = [];
  const pages = {
    '': { users: [{ id: 'a' }, { id: 'b', user_info: { n: 2 } }], count: 4, next_cursor: 'c1' },
    c1: { users: [{ id: 'c' }, { id: 'd' }], count: 4 },
  };
  const room = new LargePresence(ch, { fetchMembers: async (c) => (cursors.push(c), pages[c]) });
  ch.emit('pusher:subscription_succeeded', { members: { a: null }, count: 4, myID: 'a' });
  assert.equal(await room.loadMore(), true);
  assert.equal(await room.loadMore(), false);
  assert.equal(await room.loadMore(), false);
  assert.deepEqual(cursors, ['', 'c1']);
  assert.deepEqual([...room.members.keys()], ['a', 'b', 'c', 'd']);
});

test('subscribe validates the name and unsubscribe cleans up', () => {
  const ch = fakeChannel('presence-large-x');
  const calls = [];
  const pusher = { subscribe: (n) => (calls.push(['sub', n]), ch), unsubscribe: (n) => calls.push(['unsub', n]) };
  assert.throws(() => LargePresence.subscribe(pusher, 'presence-room'));
  const room = LargePresence.subscribe(pusher, 'presence-large-x');
  room.unsubscribe();
  assert.deepEqual(calls, [['sub', 'presence-large-x'], ['unsub', 'presence-large-x']]);
  assert.equal(ch.handlers.get('pusher:members_delta').size, 0);
});
