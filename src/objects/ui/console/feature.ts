import type { EmojiIdentifierResolvable, GuildEmojiManager } from "discord.js";
import RandomEmoji from "@0xadada/random-emoji/src/index";
import type { FeatureCallback, StopInteractingCallback, FeatureData } from "objects/commons";

/**
 * A feature is an object with information to make an action from a console.
 * The emojiName can be either a custom emoji ID or a unicode emoji name.
 */
export class Feature {

    name: string;
    emojiResolvable: EmojiIdentifierResolvable;
    description: string;
    callback: FeatureCallback;
    removeCallback?: StopInteractingCallback;

    constructor({name, emojiResolvable, description, callback, removeCallback = undefined}: FeatureData) {
            this.name = name;
            this.emojiResolvable = emojiResolvable;
            this.description = description;
            this.callback = callback;
            this.removeCallback = removeCallback;
        }

    /**
     * @param guildEmojiManager not needed if console is DM
     * @returns a string with the emoji and the feature name:
     * emoji - Feature 1
     */
     getFieldName(guildEmojiManager: GuildEmojiManager | undefined): string {
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

    /**
     * @deprecated in favor of emojiResolvable
     */
    get emojiName(): string {
        return (typeof this.emojiResolvable === 'string') ? this.emojiResolvable : this.emojiResolvable.id || this.emojiResolvable.name || RandomEmoji();
    }


}