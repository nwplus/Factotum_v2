import type { EmojiIdentifierResolvable, GuildMember, MessageReaction, PermissionOverwriteOptions, Snowflake, User } from "discord.js";
import type { Console } from '../objects/ui/console/console';

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
    stopInteracting: Function, console: Console) => Promise<void>;

export type StopInteractingCallback = (user: User, reaction: MessageReaction,
    stopInteracting: Function, console: Console) => void;

export type ShuffleFilter = (member: GuildMember) => boolean;

export type FeatureData = {
    name: string;
    emojiResolvable: EmojiIdentifierResolvable;
    description: string;
    callback: FeatureCallback;
    removeCallback?: StopInteractingCallback;
}