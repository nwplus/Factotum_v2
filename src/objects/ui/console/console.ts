import { Collection, ColorResolvable, DMChannel, EmojiIdentifierResolvable, HexColorString, Message, MessageEmbed, ReactionCollector, ReactionCollectorOptions, Snowflake, TextChannel, User } from "discord.js";
import { Feature } from "./feature";
import { randomColor } from "../../../lib/utils";
import RandomEmoji from "@0xadada/random-emoji/src/index";

export interface ConsoleInitialInfo {
    title: string;
    description: string;
    color?: string;
    fields?: Collection<string, string>;
    features?: Collection<EmojiIdentifierResolvable, Feature>;
    channel: TextChannel | DMChannel;
    collectorOptions?: ReactionCollectorOptions;
}

export class Console {

    title: string;
    description: string;
    color: HexColorString;

    /**
     * <Field Name, Field Description>
     */
    fields: Collection<string, string>;
    
    /**
     * <Emoji Resolvable, Button Info>
     */
    features: Collection<EmojiIdentifierResolvable, Feature>;

    private _collector?: ReactionCollector;
    private _message?: Message;

    initialized: boolean;

    collectorOptions: ReactionCollectorOptions;
    usersInteracting: Collection<Snowflake, User>;
    channel: TextChannel | DMChannel;
    

    constructor ({title, description, channel, features = new Collection(), 
        fields = new Collection(), color = randomColor(), collectorOptions = {}}: ConsoleInitialInfo) {
            
            this.title = title;
            this.description = description;
            this.channel = channel;
            this.color = `#${color}`;
            this.collectorOptions = collectorOptions;
            
            this.collectorOptions.dispose = true;
            this.usersInteracting = new Collection();
            this.features = new Collection();
            this.fields = new Collection();
            
            features.forEach(feature => this.addFeature(feature));
            fields.forEach((name, description) => this.addField(name, description));

            this.initialized = false;
    }

    get collector() {
        if (!this.initialized) throw "The console has not been initialized!";
        return this._collector!;
    }
    get message() {
        if (!this.initialized) throw "The console has not been initialized!";
        return this._message!;
    }

    /**
     * Sends the console to a channel
     * @param messageText - text to add to the message used to send the embed
     * @async
     * @returns Promise that will resolve when all emojis are added to the message
     */
     async sendConsole(messageText: string = '') {
        let embed = new MessageEmbed().setColor(this.color)
            .setTimestamp()
            .setTitle(this.title)
            .setDescription(this.description);
        
        // add features to embed
        this.features.forEach(feature => 
            embed.addField(feature.getFieldName(
                this.channel.type == "GUILD_TEXT" ? this.channel.guild.emojis : undefined), 
                feature.getFieldValue()
                )
            );
        
        // add feilds to embed
        this.fields.forEach((description, name) => embed.addField(name, description));

        this._message = await this.channel.send({content: messageText, embeds: [embed]});

        this.createReactionCollector(this._message);

        this.initialized = true;
        
        // react to message with feature emojis
        return Promise.all(this.features.map(feature => {
            return this.addReactionToMessage(feature);
        }));
    }

    /**
     * Creates the reaction collector in the message.
     * @param message
     */
     createReactionCollector(message: Message) {
        // make sure we don't have two collectors going!
        if (this.collector) this.stopConsole();
        
        this.collectorOptions.filter = (reaction, user) => !user.bot && 
        this.features.has(reaction.emoji) &&
        !this.usersInteracting.has(user.id);

        this._collector = message.createReactionCollector(this.collectorOptions);

        this._collector.on('collect', (reaction, user) => {
            this.usersInteracting.set(user.id, user);
            let feature = this.features.get(reaction.emoji);
            feature?.callback(user, reaction, () => this.stopInteracting(user), this);
            if (this.channel.type != 'DM' && !feature?.removeCallback)
                reaction.users.remove(user);
        });

        this._collector.on('remove', (reaction, user) => {
            let feature = this.features.get(reaction.emoji);
            if (feature && feature?.removeCallback) {
                this.usersInteracting.set(user.id, user);
                feature?.removeCallback(user, reaction, () => this.stopInteracting(user), this);
            }
        });
    }

    /**
     * Adds a feature to this console.
     * @param feature - the feature to add
     * @returns promise that will will resolve the updated message with added reaction
     */
    addFeature(feature: Feature) {
        if (!(feature instanceof Feature)) {
            throw Error(`The given feature is not a Feature object! Given object: ${feature}`);
        }

        // if the channel is a DM channel, we can't use custom emojis, so if the emoji is a custom emoji, its an ID,
        // we will grab a random emoji and use that instead
        if (this.channel.type === 'DM' && !isNaN(parseInt(feature.emojiName))) {
            feature.emojiResolvable = RandomEmoji();
        }

        this.features.set(feature.emojiResolvable, feature);

        if (this.message) {
            return Promise.all(
                [
                    this.message.edit({embeds: [this.message.embeds[0].addField(
                        feature.getFieldName(this.channel.type == "GUILD_TEXT" ? this.channel.guild.emojis : undefined), 
                        feature.getFieldValue())]
                    }),
                    this.addReactionToMessage(feature),
                ]
            );
        }
        return Promise.resolve();
    }
    
    /**
     * Removes a feature from this console.
     * @param identifier - feature name, feature emojiName or feature
     * TODO remove the feature from the message too!
     */
    removeFeature(identifier: string | Feature) {
        if (typeof identifier === 'string') {
            let isDone = this.features.delete(identifier);
            if (!isDone) {
                let feature = this.features.find(feature => feature.name === identifier);
                if (feature) this.features.delete(feature.emojiResolvable);
            }
        } else if (typeof identifier === 'object' && identifier instanceof Feature) {
            this.features.delete(identifier.emojiResolvable);
        } else {
            throw Error(`Was not given an identifier to work with when deleting a feature from this console ${this.title}`);
        }
    }

    /**
     * Adds a field to this console without adding a feature.
     * @param name - the new field name
     * @param value - the description on this field
     * @param inline
     * @returns Promise that will resolve to the edited message
     */
    addField(name: string, value: string, inline?: boolean) {
        this.fields.set(name, value);
        if(this.message) return this.message.edit({embeds: [this.message.embeds[0].addField(name, value, inline)]});
        return Promise.resolve();
    }

    /**
     * Changes the console's color.
     * @param {String} color - the new color in hex
     * @returns Promise that will resolve to the edited message with changed color
     */
    changeColor(color: string) {
        let colorResolvable: ColorResolvable = `#${color}`;
        this.color = colorResolvable;
        if (this.message) return this.message.edit({embeds: [this.message.embeds[0].setColor(this.color)]});
        return Promise.resolve();
    }

    /**
     * Stop the console from interacting with any users.
     */
    stopConsole() {
        this.collector?.stop();
    }

    /**
     * Deletes this console from discord.
     */
    delete() {
        this.stopConsole();
        return this.message?.delete();
    }

    /**
     * Callback for users to call when the user interacting with the console is done.
     * @param {User} user - the user that stopped interacting with this console.
     * @private
     */
    stopInteracting(user: User) {
        this.usersInteracting.delete(user.id);
    }

    /**
     * Add a feature reaction to the sent message. Will not do anything if the message has not been sent.
     * @param feature The feature to add reaction to the message
     * @returns Promise that resolves when the reaction is added
     */
    private addReactionToMessage(feature: Feature) {
        if (!this.message) return Promise.resolve();

        return this.message.react(feature.emojiResolvable).catch(() => {
            // the emoji is probably custom and its unavailable, so use a random emoji!
            let emoji = RandomEmoji();
            // enusre the feature keeps the emoji
            feature.emojiResolvable = emoji;
            return this.message!.react(feature.emojiResolvable);
        });
    }

}