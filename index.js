// Helper for large presence channels (presence-large-*).
//
// A large presence channel can hold up to 100,000 members, so the server
// never sends the full member list or one event per join/leave. On
// subscription the client receives the real member count and a sample (the
// earliest joiners plus itself); after that it receives one
// "pusher:members_delta" event per second at most:
//
//   {"count":100231,"joined":312,"left":40,
//    "added":[{"user_id":"u1","user_info":{...}}],"removed":["u9"]}
//
// "added" names at most 10 members and "removed" at most 50 per delta; "joined"/"left" are
// the totals of the batch and "count" is the room's member count.
//
// pusher-js keeps working (channel.members.count is right on subscription)
// but does not understand deltas. LargePresence tracks count and known
// members for you.

const DEFAULT_MAX_MEMBERS = 1000;

export class LargePresence {
  /**
   * Subscribe to a large presence channel and track it.
   * @param {import('pusher-js').default} pusher
   * @param {string} channelName must start with "presence-large-"
   * @param {object} [options] see constructor
   */
  static subscribe(pusher, channelName, options = {}) {
    if (!channelName.startsWith('presence-large-')) {
      throw new Error(`LargePresence: "${channelName}" is not a presence-large- channel`);
    }
    const room = new LargePresence(pusher.subscribe(channelName), options);
    room._unsubscribe = () => pusher.unsubscribe(channelName);
    return room;
  }

  /**
   * Track a pusher-js channel, e.g.
   * `new LargePresence(Echo.join('large-live.42').subscription)`. Create it
   * right after subscribing so no delta is missed; on a channel that is
   * already subscribed it starts from pusher-js's subscription snapshot,
   * which does not include later deltas.
   * @param {object} channel pusher-js PresenceChannel
   * @param {object} [options]
   * @param {number} [options.maxMembers=1000] members kept locally; the
   *   oldest known members are forgotten first (never yourself)
   * @param {(cursor: string) => Promise<{users: {id: string, user_info?: any}[], next_cursor?: string}>} [options.fetchMembers]
   *   loads one page of GET /apps/{id}/channels/{channel}/users through your
   *   backend (the HTTP API is signed with the app secret, so browsers
   *   cannot call it directly)
   */
  constructor(channel, options = {}) {
    this.channel = channel;
    this.name = channel.name;
    this.maxMembers = options.maxMembers ?? DEFAULT_MAX_MEMBERS;
    this.fetchMembers = options.fetchMembers;
    /** Member count of the whole room (null until subscribed). */
    this.count = null;
    /** Known members: user_id -> user_info, in the order they became known. */
    this.members = new Map();
    /** This connection's member id. */
    this.myID = null;
    this.ready = false;
    this._cursor = '';
    this._exhausted = false;
    this._handlers = new Map();
    this._unsubscribe = null;

    this._onSucceeded = (members) => this._snapshot(members);
    this._onDelta = (data) => this._delta(typeof data === 'string' ? JSON.parse(data) : data);
    channel.bind('pusher:subscription_succeeded', this._onSucceeded);
    channel.bind('pusher:members_delta', this._onDelta);
    if (channel.subscribed && channel.members && channel.members.count) {
      this._snapshot(channel.members);
    }
  }

  /** Register a handler for "ready", "change" or "error"; returns a function that removes it. */
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  _emit(event, payload) {
    for (const fn of this._handlers.get(event) ?? []) fn(payload);
  }

  /** The current user's user_info, if known. */
  get me() {
    return this.myID == null ? null : { id: this.myID, info: this.members.get(this.myID) ?? null };
  }

  _snapshot(members) {
    // pusher-js passes its Members object: .members is the sample hash,
    // .count the real member count and .myID our own id.
    const hash = members.members ?? {};
    this.members = new Map(Object.entries(hash));
    this.count = members.count ?? this.members.size;
    this.myID = members.myID ?? null;
    this._cursor = '';
    this._exhausted = false;
    this._trim();
    this.ready = true;
    this._emit('ready', { count: this.count, members: this.members });
  }

  _delta(d) {
    const added = d.added ?? [];
    const removed = d.removed ?? [];
    for (const id of removed) this.members.delete(id);
    for (const m of added) {
      this.members.delete(m.user_id); // move to the newest position
      this.members.set(m.user_id, m.user_info ?? null);
    }
    if (typeof d.count === 'number') this.count = d.count;
    this._trim();
    this._emit('change', { count: this.count, joined: d.joined ?? 0, left: d.left ?? 0, added, removed });
  }

  _trim() {
    for (const id of this.members.keys()) {
      if (this.members.size <= this.maxMembers) break;
      if (id !== this.myID) this.members.delete(id);
    }
  }

  /**
   * Load the next page of members through options.fetchMembers. Resolves
   * to true while more pages remain. Pages are in join order; members the
   * deltas already removed may appear on a page fetched just before.
   */
  async loadMore() {
    if (!this.fetchMembers) throw new Error('LargePresence: options.fetchMembers is required to page members');
    if (this._exhausted) return false;
    let page;
    try {
      page = await this.fetchMembers(this._cursor);
    } catch (err) {
      this._emit('error', err);
      throw err;
    }
    for (const u of page.users ?? []) {
      if (this.members.size >= this.maxMembers && !this.members.has(u.id)) break;
      if (!this.members.has(u.id)) this.members.set(u.id, u.user_info ?? null);
    }
    if (typeof page.count === 'number') this.count = page.count;
    this._cursor = page.next_cursor ?? '';
    this._exhausted = !page.next_cursor || this.members.size >= this.maxMembers;
    return !this._exhausted;
  }

  /** Stop tracking (and unsubscribe if LargePresence.subscribe created the subscription). */
  unsubscribe() {
    this.channel.unbind('pusher:subscription_succeeded', this._onSucceeded);
    this.channel.unbind('pusher:members_delta', this._onDelta);
    this._handlers.clear();
    if (this._unsubscribe) this._unsubscribe();
  }
}

export default LargePresence;
