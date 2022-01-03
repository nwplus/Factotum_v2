import type { EmojiIdentifierResolvable, GuildMember, MessageReaction, PermissionOverwriteOptions, Snowflake, User } from "discord.js";

/**
 * An object with a role and its permissions.
 */
 export interface RolePermission {
    id: Snowflake;
    permissions: PermissionOverwriteOptions;
}

/**
 * The function to be called when a feature is activated.
 */
 export type FeatureCallback = (user: User, reaction: MessageReaction,
    stopInteracting: Function, console: any) => Promise<void>;

export type StopInteractingCallback = (user: User, reaction: MessageReaction,
    stopInteracting: Function, console: any) => void;

export type ShuffleFilter = (member: GuildMember) => boolean;

export interface FeatureData {
    name: string;
    emojiResolvable: EmojiIdentifierResolvable;
    description: string;
    callback: FeatureCallback;
    removeCallback?: StopInteractingCallback | undefined;
}