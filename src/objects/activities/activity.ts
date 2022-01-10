import { Collection, Guild, Role, TextChannel, CategoryChannel, MessageEmbed, VoiceChannel, Message, Snowflake } from "discord.js";
import { Room } from "objects/ui/room";
import { Console } from "objects/ui/console/console";
import type { FeatureData, ShuffleFilter } from "objects/commons";
import { Feature } from "objects/ui/console/feature";
import { StringPrompt, RolePrompt, ListPrompt } from 'advanced-discord.js-prompts';
import winston from 'winston';
import { shuffleArray } from "lib/utils";
import { sendMessageToChannel } from "lib/discord-utils/discord-utils";
import { StampManager } from "objects/features/stamps/stamp-manager";


export interface ActivityInfo {
    activityName: string;
    guild: Guild;
    roleParticipants: Collection<string, Role>;
    botGuild: any; // TODO change
}

/**
 * An activity is a overarching class for any kind of activity. An activity consists of a 
 * category with voice and text channels.
 * Activities have features admins can run from the admin console by reacting to a message (console).
 * The activity can be private to specified roles or public to all users.
 * @class
 */
export class Activity {

    name: string;
    guild: Guild;
    room: Room;
    adminConsole: Console;
    botGuild: any; // TODO change

    constructor({activityName, guild, roleParticipants, botGuild}:ActivityInfo) {
        this.name = activityName;
        this.guild = guild;
        this.room = new Room(guild, botGuild, activityName, roleParticipants);
        this.adminConsole = new Console({
            title: `Activity ${activityName} Console`,
            description: 'This activity\'s information can be found below, you can also find the features available.',
            channel: guild.channels.resolve(botGuild.channelIDs.adminConsole) as TextChannel,
        });
        this.botGuild = botGuild;
    }

    /**
     * Initialize this activity by creating the channels, adding the features and sending the admin console.
     */
     async init() {
        await this.room.init();

        this.addDefaultFeatures();

        await this.adminConsole.sendConsole();

        return this;
    }

    /**
     * Adds the default features to the activity, these features are available to all activities.
     */
     protected addDefaultFeatures() {
        let localFeatures: FeatureData[] = [
            {
                name: 'Add Channel',
                description: 'Add one channel to the activity.',
                emojiResolvable: '⏫',
                callback: (user, _reaction, stopInteracting, console) => this.addChannel(console.channel, user.id).then(() => stopInteracting()),
            },
            {
                name: 'Remove Channel',
                description: 'Remove a channel, decide from a list.',
                emojiResolvable: '⏬',
                callback: (user, _reaction, stopInteracting, console) => this.removeChannel(console.channel, user.id).then(() => stopInteracting()),
            },
            {
                name: 'Delete',
                description: 'Delete this activity and its channels.',
                emojiResolvable: '⛔',
                callback: (_user, _reaction, _stopInteracting, _console) => this.delete(),
            },
            {
                name: 'Archive',
                description: 'Archive the activity, text channels are saved.',
                emojiResolvable: '💼',
                callback: (_user, _reaction, _stopInteracting, _console) => {
                    let archiveCategory = this.guild.channels.resolve(this.botGuild.channelIDs.archiveCategory);
                    if (archiveCategory.type === 'GUILD_CATEGORY') {
                        return this.archive(archiveCategory);
                    }
                    else return Promise.resolve();
                }
            },
            {
                name: 'Callback',
                description: 'Move all users in the activity\'s voice channels back to a specified voice channel.',
                emojiResolvable: '🔃',
                callback: (user, _reaction, stopInteracting, console) => this.voiceCallBack(console.channel, user.id).then(() => stopInteracting()),
            },
            {
                name: 'Shuffle',
                description: 'Shuffle all members from one channel to all others in the activity.',
                emojiResolvable: '🌬️',
                callback: (user, _reaction, stopInteracting, console) => this.shuffle(console.channel, user.id).then(() => stopInteracting()),
            },
            {
                name: 'Role Shuffle',
                description: 'Shuffle all the members with a specific role from one channel to all others in the activity.',
                emojiResolvable: '🦜',
                callback: (user, _reaction, stopInteracting, console) => this.roleShuffle(console.channel, user.id).then(() => stopInteracting()),
            },
            {
                name: 'Distribute Stamp',
                description: 'Send a emojiResolvable collector for users to get a stamp.',
                emojiResolvable: '🏕️',
                callback: (user, _reaction, stopInteracting, console) => this.distributeStamp(console.channel, user.id).then(() => stopInteracting()),
            },
            {
                name: 'Rules Lock',
                description: 'Lock the activity behind rules, users must agree to the rules to access the channels.',
                emojiResolvable: '🔒',
                callback: (user, _reaction, stopInteracting, console) => this.ruleValidation(console.channel, user.id).then(() => stopInteracting()),
            }
        ];

        return Promise.all(localFeatures.map(feature => this.adminConsole.addFeature(new Feature(feature))));
    }

    /**
     * FEATURES FROM THIS POINT DOWN.
     */

    /**
     * Add a channel to the activity, prompts user for info and name.
     * @param channel - channel to prompt user for specified voice channel
     * @param userId - user to prompt for specified voice channel
     */
     async addChannel(channel: TextChannel, userId: string) {
        // voice or text
        let option = await ListPrompt.singleReactionPicker({
            prompt: 'What type of channel do you want?',
            channel,
            userId,
        }, [
            {
                name: 'voice',
                description: 'A voice channel',
                emojiName: '🔊'
            },
            {
                name: 'text',
                description: 'A text channel',
                emojiName: '✍️',
            }
        ]);
        // channel name
        let name = await StringPrompt.single({ prompt: 'What is the name of the channel?', channel, userId });

        if (option.name === 'voice') return this.room.addVoiceChannel({name});
        else return this.room.addTextChannel({name});
    }

    /**
     * Removes a channel from the activity, the user will decide which. Wont delete channels in the safeChannel map.
     * @param {TextChannel} channel - channel to prompt user for specified voice channel
     * @param {String} userId - user to prompt for specified voice channel
     * @async
     */
    async removeChannel(channel: TextChannel, userId: string) {
        let removeChannel: TextChannel = await ListPrompt.singleListChooser({
            prompt: 'What channel should be removed?',
            channel: channel,
            userId: userId
        }, Array.from(this.room.channels!.category!.children.values()));

        try {
            return this.room.removeRoomChannel(removeChannel);
        } catch (error) {
            sendMessageToChannel({
                channel: channel, 
                message: 'Can\'t remove that channel!', 
                userId: userId, 
                timeout: 10
            });
            return;
        }
    }

    /**
     * Archive the activity. Move general text channel to archive category, remove all remaining channels
     * and remove the category.
     * @param {CategoryChannel} archiveCategory - the category where the general text channel will be moved to
     * @async
     */
    async archive(archiveCategory: CategoryChannel) {
        await this.room.archive(archiveCategory);
        this.adminConsole.delete();
    }

    /**
     * Delete all the channels and the category. Remove the workshop from firebase.
     */
    delete() {
        return Promise.all([this.room.delete(), this.adminConsole.delete()])
    }

    /**
     * Move all users back to a specified voice channel from the activity's voice channels.
     * @param {TextChannel} channel - channel to prompt user for specified voice channel
     * @param {String} userId - user to prompt for specified voice channel
     */
    async voiceCallBack(channel: TextChannel, userId: string) {
        /** @type {VoiceChannel} */
        let mainChannel: VoiceChannel = await ListPrompt.singleListChooser({
            prompt: 'What channel should people be moved to?',
            channel: channel,
            userId: userId
        }, Array.from(this.room.channels.voiceChannels.values()));

        return Promise.all(this.room.channels.voiceChannels.map(channel => {
            return channel.members.map(member => member.voice.setChannel(mainChannel));
        }));
    }

    /**
     * Shuffle all the general voice members on all other voice channels
     * @param {TextChannel} channel - channel to prompt user for specified voice channel
     * @param {String} userId - user to prompt for specified voice channel
     * @param {ShuffleFilter} [filter] - filter the users to shuffle
     */
    async shuffle(channel: TextChannel, userId: string, filter?: ShuffleFilter) {
        let mainChannel: VoiceChannel = await ListPrompt.singleListChooser({
            prompt: 'What channel should I move people from?',
            channel: channel,
            userId: userId
        }, Array.from(this.room.channels.voiceChannels.values()));

        let members = mainChannel.members;
        if (filter) members = members.filter(member => filter(member));

        let memberList = Array.from(members.values());
        shuffleArray(memberList);

        let channels = Array.from(this.room.channels.voiceChannels.filter(channel => channel.id != mainChannel.id).values());

        let channelsLength = channels.length;
        let channelIndex = 0;
        memberList.forEach(member => {
            try {
                member.voice.setChannel(channels[channelIndex % channelsLength]);
                channelIndex++;
            } catch (error) {
                winston.loggers.get(this.guild.id).warning(`Could not set a users voice channel when shuffling an activity by role. Error: ${error}`, { event: 'Activity' });
            }
        });

        winston.loggers.get(this.guild.id).log(`Activity named ${this.name} had its voice channel members shuffled around!`, { event: 'Activity' });
    }

    /**
     * Shuffles users with a specific role throughout the activity's voice channels
     * @param {TextChannel} channel - channel to prompt user for specified voice channel
     * @param {String} userId - user to prompt for specified voice channel
     * @async
     */
    async roleShuffle(channel: TextChannel, userId: string) {
        try {
            var role = await RolePrompt.single({ prompt: 'What role would you like to shuffle?', channel, userId });
        } catch (error) {
            winston.loggers.get(this.guild.id).warning(`User canceled a request when asking for a role for role shuffle. Error: ${error}.`, { event: 'Activity' });
        }

        this.shuffle(channel, userId, (member) => member.roles.cache.has(role.id));
    }

    /**
     * Will let hackers get a stamp for attending the activity. Will ask user where to send the stamp collector
     * @param {TextChannel} channel - channel to prompt user for specified text channel to send stamp collector
     * @param {String} userId - user to prompt for specified text channel
     */
    async distributeStamp(channel: TextChannel, userId: string) {

        if (!this.botGuild.stamps.isEnabled) {
            sendMessageToChannel({
                channel: channel, 
                message: 'The stamp system is not enabled in this server!', 
                timeout: 10
            });
            return;
        }

        // The users already seen by this stamp distribution.
        let seenUsers = new Collection<Snowflake, string>();

        const promptEmbed = new MessageEmbed()
            .setColor(this.botGuild.colors.embedColor)
            .setTitle('React within ' + this.botGuild.stamps.stampCollectionTime + 
            ' seconds of the posting of this message to get a stamp for ' + this.name + '!'
            );

        // send embed to general text or prompt for channel
        let promptMsg: Message;
        if (await this.room.generalText.fetch(true)) {
            promptMsg = await this.room.generalText.send({embeds: [promptEmbed]});
        } else {
            let stampChannel = await ListPrompt.singleListChooser({
                prompt: 'What channel should the stamp distribution go?',
                channel: channel,
                userId: userId
            }, Array.from(this.room.channels.textChannels.values()));
            promptMsg = await stampChannel.send(promptEmbed);
        }

        promptMsg.react('👍');

        // reaction collector, time is needed in milliseconds, we have it in seconds
        const collector = promptMsg.createReactionCollector({ 
            time: (1000 * this.botGuild.stamps.stampCollectionTime),
            filter: (_reaction, user) => !user.bot,
        });

        collector.on('collect', async (_reaction, user) => {
            // grab the member object of the reacted user
            const member = this.guild.members.resolve(user);

            if (!seenUsers.has(user.id) && member) {
                StampManager.parseRole(member, this.name, this.botGuild);
                seenUsers.set(user.id, user.username);
            }
        });

        // edit the message to closed when the collector ends
        collector.on('end', () => {
            if (!promptMsg.deleted) {
                promptMsg.edit({
                    embeds: [
                        promptEmbed.setTitle('Time\'s up! No more responses are being collected. Thanks for participating in ' + this.name + '!'),
                    ],
                });
            }
        });
    }

    /**
     * Will lock the channels behind an emoji collector.
     * @param {TextChannel} channel - channel to prompt user for specified voice channel
     * @param {String} userId - user to prompt for specified voice channel
     */
    async ruleValidation(channel: TextChannel, userId: string) {

        let rulesChannel = await this.room.lockRoom() as TextChannel;
        if (!rulesChannel) {
            winston.loggers.get(this.guild.id).error(`Could not create rules channel when activated rules validation!`, { event: 'Activity' });
            return;
        }

        let rules = await StringPrompt.single({ prompt: 'What are the activity rules?', channel, userId });

        let joinEmoji = '🚗';

        const embed = new MessageEmbed().setTitle('Activity Rules').setDescription(rules).addField('To join the activity:', `React to this message with ${joinEmoji}`).setColor(this.botGuild.colors.embedColor);

        const embedMsg = await rulesChannel.send({
            embeds: [embed],
        });

        embedMsg.react(joinEmoji);

        const collector = embedMsg.createReactionCollector({
            filter: (reaction, user) => !user.bot && reaction.emoji.name === joinEmoji,
        });

        collector.on('collect', (_reaction, user) => {
            this.room.giveUserAccess(user);
            rulesChannel.permissionOverwrites.create(user.id, { VIEW_CHANNEL: false });
        });
    }
}