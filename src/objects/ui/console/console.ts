import { Collection, ColorResolvable, DMChannel, HexColorString, Message, MessageEmbed, ReactionCollector, ReactionCollectorOptions, Snowflake, TextChannel, User } from "discord.js";
import { Feature } from "./feature";
import { randomColor } from "../../../lib/utils";
import { getEmoji } from 'get-random-emoji';

export interface ConsoleInitialInfo {
    title: string;
    description: string;
    color: string;
    fields: Collection<string, string>;
    features: Collection<string, Feature>;
    channel: TextChannel | DMChannel;
    collectorOptions: ReactionCollectorOptions;
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
     * <Emoji Name, Button Info>
     */
    features: Collection<string, Feature>;

    collector: ReactionCollector;
    collectorOptions: ReactionCollectorOptions;
    usersInteracting: Collection<Snowflake, User>;
    message: Message;
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
        
        this.features.forEach(feature => 
            embed.addField(feature.getFieldName(
                this.channel.type == "GUILD_TEXT" ? this.channel.guild.emojis : undefined), 
                feature.getFieldValue()
                )
            );
        
        this.fields.forEach((description, name) => embed.addField(name, description));

        this.message = await this.channel.send({content: messageText, embeds: [embed]});

        this.createReactionCollector(this.message);

        return Promise.all(this.features.map(feature => {
            return this.message.react(feature.emojiName).catch((reason) => {
                // the emoji is probably custom we need to find it!
                let emoji = this.message.guild.emojis.cache.find(guildEmoji => guildEmoji.name === feature.emojiName);
                return this.message.react(emoji);
            });
        }));
    }

    /**
     * Creates the reaction collector in the message.
     * @param message
     */
     createReactionCollector(message: Message) {
        // make sure we don't have two collectors going!
        if (this.collector) this.stopConsole();
        

        const filter = (reaction, user) => !user.bot && 
        this.features.has(reaction.emoji.id || reaction.emoji.name) &&
        !this.usersInteracting.has(user.id);
        this.collectorOptions.filter = filter;

        this.collector = message.createReactionCollector(this.collectorOptions);

        this.collector.on('collect', (reaction, user) => {
            this.usersInteracting.set(user.id, user);
            let feature = this.features.get(reaction.emoji.id || reaction.emoji.name);
            feature?.callback(user, reaction, () => this.stopInteracting(user), this);
            if (this.channel.type != 'DM' && !feature?.removeCallback)
                reaction.users.remove(user);
        });

        this.collector.on('remove', (reaction, user) => {
            let feature = this.features.get(reaction.emoji.id || reaction.emoji.name);
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
            feature.emojiName = getEmoji();
        }

        this.features.set(feature.emojiName, feature);

        if (this.message) {
            return Promise.all(
                [
                    this.message.edit({embeds: [this.message.embeds[0].addField(
                        feature.getFieldName(this.channel.type == "GUILD_TEXT" ? this.channel.guild.emojis : undefined), 
                        feature.getFieldValue())]
                    }),
                    this.message.react(feature.emojiName).catch(reason => {
                        // the emoji is probably custom we need to find it!
                        let emoji = this.message.guild.emojis.cache.find(guildEmoji => guildEmoji.name === feature.emojiName);
                        this.message.react(emoji);
                    })
                ]
            );
        }
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
                this.features.delete(feature.emojiName);
            }
        } else if (typeof identifier === 'object') {
            this.features.delete(identifier?.emojiName);
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
    }

    /**
     * Changes the console's color.
     * @param {String} color - the new color in hex
     * @returns Promise that will resolve to the edited message with changed color
     */
    changeColor(color: string) {
        let colorResolvable: ColorResolvable = `#${color}`;
        this.color = colorResolvable;

        return this.message.edit({embeds: [this.message.embeds[0].setColor(this.color)]});
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
        this.message?.delete();
    }

    /**
     * Callback for users to call when the user interacting with the console is done.
     * @param {User} user - the user that stopped interacting with this console.
     * @private
     */
    stopInteracting(user: User) {
        this.usersInteracting.delete(user.id);
    }

}