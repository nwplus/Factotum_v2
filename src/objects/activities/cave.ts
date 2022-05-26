import { Console } from '../ui/console/console';
import { CategoryChannel, Collection, ColorResolvable, EmojiIdentifierResolvable, Guild, GuildEmoji, MessageEmbed, ReactionEmoji, Role, Snowflake, TextChannel } from 'discord.js';
import { Activity } from './activity';
import { StringPrompt, SpecialPrompt, NumberPrompt } from 'advanced-discord.js-prompts';
import { Feature } from '../ui/console/feature';
import { TicketManager } from '../features/tickets/ticket-manager';import { Room } from '../ui/room';
import { sendMessageToChannel } from '../../lib/discord-utils/discord-utils';
import { addRoleToMember, removeRoleToMember } from '../../lib/discord-utils/role-utils';
import type { BotGuild } from '../../objects/bot-guild';

export type CaveOptions = {
    name: string;
    /** any pre name emojis */
    preEmojis: EmojiIdentifierResolvable[];
    /** the text to add before every role name, not including '-' */
    preRoleText: string;
    /** the role color to use for this cave */
    color: ColorResolvable;
    /** the role associated with this cave */
    role: Role;
    emojis: CaveEmojis;
    times: CaveTimes;
    /** the roles that can request tickets */
    publicRoles: Collection<string, Role>
}

/** Different emojis used by the Cave class. */
export type CaveEmojis = {
    /** emoji for mentors to accept a ticket */
    joinTicketEmoji: EmojiIdentifierResolvable;
    /** emoji for mentors to join an ongoing ticket */
    giveHelpEmoji: EmojiIdentifierResolvable;
    /** emoji for hackers to request a ticket */
    requestTicketEmoji: EmojiIdentifierResolvable;
    /** emoji for Admins to add a mentor role */
    addRoleEmoji: EmojiIdentifierResolvable;
    /** emoji for Admins to force delete ticket channels */
    deleteChannelsEmoji: EmojiIdentifierResolvable;
    /** emoji for Admins to opt tickets in/out of garbage collector */
    excludeFromAutoDeleteEmoji: EmojiIdentifierResolvable;
}

export type CaveTimes = {
    /** number of minutes a ticket channel will be inactive before bot starts to delete it */
    inactivePeriod: number;
    /** number of minutes the bot will wait for a response before deleting ticket */
    bufferTime: number;
    /** number of minutes the bot will wait before reminding mentors of unaccepted tickets */
    reminderTime: number;
}

export type SubRole = {
    name: string;
    /** the role id */
    id: Snowflake;
    /** number of users with this role */
    activeUsers: number;
}

/**
 * @typedef CaveChannels
 * @property {TextChannel} roleSelection
 */

 export class Cave extends Activity {

    caveOptions: CaveOptions;
    /**
     * The cave sub roles, keys are the emoji name, holds the subRole
     * <Emoji Name, SubRole>
     */
    subRoles: Collection<string, SubRole>;
    _ticketManager?: TicketManager;
    /** The public room for this cave. */
    publicRoom: Room;
    /** The console where cave members can get sub roles. */
    _subRoleConsole?: Console;

    _roleSelectionChannel?: TextChannel;

    get ticketManager() {
        if (!this._ticketManager) throw "Ticket Manager not available! You need to initialize the cave first!";
        return this._ticketManager;
    }
    get subRoleConsole() {
        if (!this._subRoleConsole) throw "Sub Role Console not available! You need to initialize the cave first!";
        return this._subRoleConsole;
    }
    get roleSelectionChannel() {
        if (!this._roleSelectionChannel) throw "Role Selection Channel not available! You need to initialize the cave first!";
        return this._roleSelectionChannel;
    }


    /**
     * @constructor
     * @param caveOptions 
     * @param botGuild 
     * @param guild
     */
    constructor(caveOptions: CaveOptions, botGuild: BotGuild, guild: Guild) {
        super({
            activityName: caveOptions.name,
            guild: guild,
            roleParticipants: new Collection([[caveOptions.role.id, caveOptions.role]]),
            botGuild: botGuild,
        });

        this.caveOptions = caveOptions;
        this.subRoles = new Collection();
        this.publicRoom = new Room(guild, `👉🏽👈🏽${caveOptions.name} Help`, caveOptions.publicRoles);
    }

    /**
     * @override
     * @returns this
     */
    async init() {
        await super.init();

        this._roleSelectionChannel = await this.room.addTextChannel({
            name: `📝${this.name}-role-selector`,
            info: {
                topic: 'Sign yourself up for specific roles! New roles will be added as requested, only add yourself to one if you feel comfortable responding to questions about the topic.',
            },
            isSafe: true,
        });
        this._subRoleConsole = new Console({
            title: 'Choose your sub roles!',
            description: 'Choose sub roles you are comfortable answering questions for! Remove your reaction to loose the sub role.',
            channel: this.roleSelectionChannel,
        });
        this.subRoleConsole.sendConsole();

        for (var i = 0; i < 3; i++) {
            this.room.addVoiceChannel({
                name: `🗣️ Room ${i}`,
            });
        }

        await this.publicRoom.init();

        this._ticketManager = new TicketManager(this, {
            ticketCreatorInfo: {
                channel: await this.publicRoom.addTextChannel({
                    name: '🎫request-ticket',
                    isSafe: true,
                }),
            },
            ticketDispatcherInfo: {
                channel: await this.room.addTextChannel({
                    name: '📨incoming-tickets',
                    isSafe: true,
                }),
                takeTicketEmoji: this.caveOptions.emojis.giveHelpEmoji,
                joinTicketEmoji: this.caveOptions.emojis.joinTicketEmoji,
                reminderInfo: {
                    isEnabled: true,
                    time: this.caveOptions.times.reminderTime,
                    reminders: new Collection(),
                },
                mainHelperInfo: {
                    role: this.caveOptions.role,
                    emoji: this.caveOptions.emojis.requestTicketEmoji,
                },
                embedCreator: (ticket) => new MessageEmbed()
                    .setTitle(`New Ticket - ${ticket.id}`)
                    .setDescription(`<@${ticket.group.first()?.id}> has a question: ${ticket.question}`)
                    .addField('They are requesting:', `<@&${ticket.requestedRole.id}>`)
                    .setTimestamp(),
            },
            systemWideTicketInfo: {
                garbageCollectorInfo: {
                    isEnabled: true,
                    inactivePeriod: this.caveOptions.times.inactivePeriod,
                    bufferTime: this.caveOptions.times.bufferTime
                },
                isAdvancedMode: true,
            }
        });

        await this.ticketManager.sendTicketCreatorConsole('Get some help from our mentors!',
            'To submit a ticket to the mentors please react to this message with the appropriate emoji. **If you are unsure, select a general ticket!**');
    
        return this;
    }

    /**
     * @override
     */
    addDefaultFeatures() {
        let localFeatures = [
            new Feature({
                name: 'Add Sub-Role',
                description: 'Add a new sub-role cave members can select and users can use to ask specific tickets.',
                emojiResolvable: this.caveOptions.emojis.addRoleEmoji,
                callback: (user, _reaction, stopInteracting, console) => this.addSubRoleCallback(console.channel as TextChannel, user.id).then(() => stopInteracting()),
            }),
            new Feature({
                name: 'Delete Ticket Channels',
                description: 'Get the ticket manager to delete ticket rooms to clear up the server.',
                emojiResolvable: this.caveOptions.emojis.deleteChannelsEmoji,
                callback: (user, _reaction, stopInteracting, console) => this.deleteTicketChannelsCallback(console.channel as TextChannel, user.id).then(() => stopInteracting()),
            }),
            new Feature({
                name: 'Include/Exclude Tickets',
                description: 'Include or exclude tickets from the automatic garbage collector.',
                emojiResolvable: this.caveOptions.emojis.excludeFromAutoDeleteEmoji,
                callback: (user, _reaction, stopInteracting, console) => this.includeExcludeCallback(console.channel as TextChannel, user.id).then(() => stopInteracting()),
            }),
        ];

        localFeatures.forEach(feature => this.adminConsole.addFeature(feature));

        return super.addDefaultFeatures();
    }

    /**
     * Prompts a user for information to create a new sub role for this cave.
     * @param channel 
     * @param userId 
     * @async
     */
    async addSubRoleCallback(channel: TextChannel, userId: string): Promise<Role> {
        let roleName = await StringPrompt.single({ prompt: 'What is the name of the new role?', channel, userId });

        let emojis = new Collection<string, string>();
        this.subRoles.forEach((subRole, emojiName, _map) => {
            emojis.set(emojiName, subRole.name);
        });

        let reaction = await SpecialPrompt.singleRestrictedReaction({ prompt: 'What emoji do you want to associate with this new role?', channel, userId }, emojis);
        let emoji = reaction.emoji;

        // search for possible existing role
        let findRole = this.guild.roles.cache.find(role => role.name.toLowerCase() === `${this.caveOptions.preRoleText}-${roleName}`.toLowerCase());
        let useOld;
        if (findRole) useOld = await SpecialPrompt.boolean({ prompt: 'I have found a role with the same name! Would you like to use that one? If not I will create a new one.', channel, userId });

        let role;
        if (useOld) role = findRole!;
        else role = await this.guild.roles.create({
            name: `${this.caveOptions.preRoleText}-${roleName}`,
            color: this.caveOptions.color,
        });

        this.addSubRole(role, emoji);

        try {
            let addPublic = await SpecialPrompt.boolean({ prompt: 'Do you want me to create a public text channel?', channel, userId });
            if (addPublic) this.publicRoom.addTextChannel({ name: roleName });
        } catch {
            // do nothing
        }

        return role;
    }

    /**
     * Will prompt the user for more information to delete some, all, or a few tickets.
     * @param channel 
     * @param userId 
     */
    async deleteTicketChannelsCallback(channel: TextChannel, userId: string) {
        let type = await StringPrompt.restricted({
            prompt: 'Type "all" if you would like to delete all tickets before x amount of time or type "some" to specify which tickets to remove.',
            channel,
            userId,
        }, ['all', 'some']);

        switch (type) {
            case 'all': {
                let age = await NumberPrompt.single({ prompt: 'Enter how old, in minutes, a ticket has to be to remove. Send 0 if you want to remove all of them. Careful - this cannot be undone!', channel, userId });
                this.ticketManager.removeTicketsByAge(age);
                sendMessageToChannel({channel, userId, message: `All tickets over ${age} have been deleted!`});
                break;
            }
            case ('some'): {
                let subtype = await StringPrompt.restricted({
                    prompt: 'Would you like to remove all tickets except for some tickets you specify later or would you like to remove just some tickets. Type all or some respectively.',
                    channel,
                    userId
                }, ['all', 'some']);

                switch (subtype) {
                    case 'all': {
                        let ticketMentions = await NumberPrompt.multi({
                            prompt: 'In one message write the numbers of the tickets to not delete! (Separated by spaces, ex 1 2 13).',
                            channel,
                            userId
                        });
                        this.ticketManager.removeAllTickets(ticketMentions);
                        break;
                    }
                    case 'some': {
                        let ticketMentions = await NumberPrompt.multi({
                            prompt: 'In one message type the ticket numbers you would like to remove! (Separated by spaces, ex. 1 23 3).',
                            channel,
                            userId,
                        });
                        this.ticketManager.removeTicketsById(ticketMentions);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Will prompt the user for channel numbers to include or exclude from the garbage collector.
     * @param channel 
     * @param userId 
     */
    async includeExcludeCallback(channel: TextChannel, userId: string) {
        let type = await StringPrompt.restricted({
            prompt: 'Would you like to include tickets on the automatic garbage collector or exclude tickets? Respond with include or exclude respectively.',
            channel,
            userId,
        }, ['include', 'exclude']);

        let tickets = await NumberPrompt.multi({
            prompt: `Type the ticket numbers you would like to ${type} separated by spaces.`,
            channel,
            userId,
        });

        tickets.forEach((ticketNumber) => {
            let ticket = this.ticketManager.tickets.get(ticketNumber);
            ticket?.includeExclude(type === 'exclude' ? true : false);
        });
    }

    /**
     * Adds a subRole.
     * @param role - the role to add
     * @param emoji - the emoji associated to this role
     * @param currentActiveUsers - number of active users with this role
     */
    private addSubRole(role: Role, emoji: GuildEmoji | ReactionEmoji, currentActiveUsers: number = 0) {
        let subRoleName = role.name.substring(this.caveOptions.preRoleText.length + 1);
        let subRole: SubRole = {
            name: subRoleName,
            id: role.id,
            activeUsers: currentActiveUsers,
        };

        // add to list of emojis being used
        this.subRoles.set(emoji.name || emoji.identifier, subRole);

        // add to subRole selector console
        this.subRoleConsole.addFeature(
            new Feature({
                name: `-> If you know ${subRoleName}`,
                description: '---------------------------------',
                emojiResolvable: emoji,
                callback: async (user, _reaction, stopInteracting, console) => {
                    let member = await this.guild.members.fetch(user);
                    await addRoleToMember(member, role);
                    await sendMessageToChannel({channel: console.channel as TextChannel, userId: user.id, message: `You have received the ${subRoleName} role!`, timeout: 10});
                    stopInteracting();
                },
                removeCallback: async (user, _reaction, stopInteracting, console) => {
                    let member = await this.guild.members.fetch(user);
                    await removeRoleToMember(member, role);
                    await sendMessageToChannel({channel: console.channel as TextChannel, userId: user.id, message: `You have lost the ${subRoleName} role!`, timeout: 10});
                    stopInteracting();
                },
            })
        );

        this.ticketManager.addTicketType(role, subRole.name, emoji);
    }

    /** 
     * Delete all the sub roles
     */
    async deleteSubRoles() {
        return Promise.all(this.subRoles.map((subRole) => {
            let role = this.guild.roles.cache.find(role => role.id === subRole.id);
            if (role) return role.delete();
            return Promise.resolve();
        }));
    }
    /**
     * Deletes all the tickets rooms, public channels and private channels.
     * @override
     */
    async delete() {
        await this.deleteSubRoles();
        await this.publicRoom.delete();
        await this.ticketManager.removeAllTickets();
        return super.delete();
    }

    /**
     * Removes private channels and archives the public channels.
     * It also deletes the ticket rooms.
     * @override
     * @param archiveCategory 
     */
    archive(archiveCategory: CategoryChannel) {
        this.room.delete();
        this.publicRoom.archive(archiveCategory);
        this.ticketManager.removeAllTickets();
        return super.archive(archiveCategory);
    }
}