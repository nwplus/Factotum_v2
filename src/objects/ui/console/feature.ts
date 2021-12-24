import { GuildEmojiManager, MessageReaction, User } from "discord.js";

/**
 * The function to be called when a feature is activated.
 */
export type FeatureCallback = (user: User,reaction: MessageReaction,
    stopInteracting: Function, console: any) => Promise<void>;

export type StopInteractingCallback = (user: User,reaction: MessageReaction,
    stopInteracting: Function, console: any) => void;

/**
 * A feature is an object with information to make an action from a console.
 * The emojiName can be either a custom emoji ID or a unicode emoji name.
 */
export class Feature {

    name: string;
    emojiName: string;
    description: string;
    callback: FeatureCallback;
    removeCallback: StopInteractingCallback;

    constructor(name: string, emojiName: string,
        description: string, callback: FeatureCallback, removeCallback: StopInteractingCallback = undefined) {

            this.name = name;
            this.emojiName = emojiName;
            this.description = description;
            this.callback = callback;
            this.removeCallback = removeCallback;

        }

    /**
     * @param guildEmojiManager not needed if console is DM
     * @returns a string with the emoji and the feature name:
     * emoji - Feature 1
     */
     getFieldName(guildEmojiManager: GuildEmojiManager): string {
        let emoji;

        if (guildEmojiManager != undefined) {
            emoji = guildEmojiManager.resolve(this.emojiName);
        }

        return `${emoji ? emoji.toString() : this.emojiName} - ${this.name}`;
    }

    /**
     * @returns the feature's value string for when adding it to a embed field.
     */
    getFieldValue(): string {
        return this.description;
    }

}