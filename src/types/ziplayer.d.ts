// Global ambient declarations — NO top-level imports.
// Using import() types inline so this file is treated as a global ambient file,
// which REPLACES (not augments) the package's own .d.ts files.

declare module "ziplayer" {
  type VoiceBasedChannel = import("discord.js").VoiceBasedChannel;
  type GuildTextBasedChannel = import("discord.js").GuildTextBasedChannel;

  export interface LyricsPayload {
    current?: string;
    text?: string;
  }

  export interface Track {
    title: string;
    url: string;
    thumbnail: string;
    author: string;
    duration: string;
    source?: string;
    requestedBy?: { id?: string; tag?: string } | null;
    metadata?: { author?: string };
  }

  export interface TrackCollection {
    size: number;
    toArray(): Track[];
    [Symbol.iterator](): Iterator<Track>;
  }

  export interface Queue {
    tracks: TrackCollection;
    add(track: Track): void;
    addMultiple(tracks: Track[]): void;
    remove(index: number): void;
    insert(track: Track, index: number): void;
    clear(): void;
  }

  export interface Player {
    guildId: string;
    isPlaying: boolean;
    isPaused: boolean;
    connection: { subscribe(player: unknown): unknown } | null;
    currentTrack: Track | null;
    queue: Queue;
    history?: { tracks: { toArray(): Track[] } };
    position?: number;
    autoplay?: boolean;
    volume?: number;
    /** Internal audio player node (used by playlocal) */
    node?: unknown;
    userdata: { channel?: GuildTextBasedChannel | null };

    connect(channel: VoiceBasedChannel): Promise<void>;
    disconnect(): Promise<void>;
    play(track: Track): Promise<void>;
    skip(count?: number): Promise<void>;
    previous(): Promise<boolean>;
    pause(): void;
    resume(): void;
    stop(): void;
    destroy(): void;
    seek(ms: number): Promise<void>;
    loop(mode: "track" | "queue" | "off"): void;
    shuffle(): void;
    search(query: string, requestedBy: unknown): Promise<SearchResult>;
    getProgressBar?(opts?: { timecodes?: boolean; length?: number }): string;
  }

  export interface SearchResult {
    tracks: Track[];
    playlist?: {
      title?: string;
      url?: string;
      thumbnail?: string;
    };
  }

  export interface PlayerManagerOptions {
    plugins?: unknown[];
    extensions?: unknown[];
  }

  export interface PlayerOptions {
    userdata?: { channel?: GuildTextBasedChannel | null };
    selfDeaf?: boolean;
    volume?: number;
    leaveOnEmpty?: boolean;
    leaveOnEnd?: boolean;
    leaveOnStop?: boolean;
  }

  export class PlayerManager {
    players: Map<string, Player>;

    constructor(options: PlayerManagerOptions);

    create(guildId: string, options: PlayerOptions): Promise<Player>;

    on(event: "audioTrackAdd", listener: (player: Player, track: Track) => void): this;
    on(
      event: "trackStart",
      listener: (player: Player, track: Track) => void | Promise<void>,
    ): this;
    on(event: "trackEnd", listener: (player: Player, track: Track) => void): this;
    on(
      event: "lyricsCreate",
      listener: (player: Player, track: Track, payload: LyricsPayload) => void,
    ): this;
    on(
      event: "lyricsChange",
      listener: (player: Player, track: Track, payload: LyricsPayload) => void,
    ): this;
    on(event: "queueEnd", listener: (player: Player) => void): this;
    on(event: "disconnect", listener: (player: Player) => void): this;
    on(event: "playerDestroy", listener: (player: Player) => void): this;
  }

  export function getManager(): PlayerManager;
  export function getPlayer(guildId: string): Player | null;
}

declare module "@ziplayer/plugin" {
  export class YouTubePlugin {
    getStream: unknown;
  }
  export class SoundCloudPlugin {}
  export class SpotifyPlugin {}
}

declare module "@ziplayer/extension" {
  export class lyricsExt {
    constructor(
      param: null,
      options?: {
        provider?: string;
        includeSynced?: boolean;
        autoFetchOnTrackStart?: boolean;
      },
    );
  }
}

declare module "@ziplayer/ytexecplug" {
  export class YTexec {
    getStream: unknown;
  }
}
