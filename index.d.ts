export interface LargePresenceMember {
  user_id: string;
  user_info: unknown;
}

export interface MembersDelta {
  /** Member count of the whole room. */
  count: number | null;
  /** Members who joined in this batch (exact total). */
  joined: number;
  /** Members who left in this batch (exact total). */
  left: number;
  /** Up to 10 of the members who joined. */
  added: LargePresenceMember[];
  /** Up to 50 of the members who left. */
  removed: string[];
}

export interface MembersPage {
  users: { id: string; user_info?: unknown }[];
  count?: number;
  next_cursor?: string;
}

export interface LargePresenceOptions {
  /** Members kept locally (default 1000); the oldest known are forgotten first. */
  maxMembers?: number;
  /** Loads a page of GET /apps/{app_id}/channels/{channel}/users through your backend. */
  fetchMembers?: (cursor: string) => Promise<MembersPage>;
}

/** Minimal shape of a pusher-js channel. */
export interface ChannelLike {
  name: string;
  subscribed?: boolean;
  members?: { members?: Record<string, unknown>; count?: number; myID?: string };
  bind(event: string, callback: (data: any) => void): unknown;
  unbind(event: string, callback: (data: any) => void): unknown;
}

export interface PusherLike {
  subscribe(channelName: string): ChannelLike;
  unsubscribe(channelName: string): void;
}

export declare class LargePresence {
  static subscribe(pusher: PusherLike, channelName: string, options?: LargePresenceOptions): LargePresence;
  constructor(channel: ChannelLike, options?: LargePresenceOptions);
  readonly channel: ChannelLike;
  readonly name: string;
  /** Member count of the whole room (null until subscribed). */
  count: number | null;
  /** Known members: user_id -> user_info. */
  members: Map<string, unknown>;
  myID: string | null;
  ready: boolean;
  readonly me: { id: string; info: unknown } | null;
  on(event: 'ready', fn: (e: { count: number; members: Map<string, unknown> }) => void): () => void;
  on(event: 'change', fn: (e: MembersDelta) => void): () => void;
  on(event: 'error', fn: (e: unknown) => void): () => void;
  off(event: string, fn: (...args: any[]) => void): void;
  /** Loads the next page of members; resolves to true while more remain. */
  loadMore(): Promise<boolean>;
  unsubscribe(): void;
}

export default LargePresence;
