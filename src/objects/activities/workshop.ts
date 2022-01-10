import { SpecialPrompt, ListPrompt, StringPrompt } from 'advanced-discord.js-prompts';
import { Collection, EmojiIdentifierResolvable, GuildChannelCreateOptions, Message, MessageEmbed, Role, Snowflake, TextChannel, VoiceChannel } from 'discord.js';
import { Activity, ActivityInfo } from './activity';
import { TicketManager } from '../features/tickets/ticket-manager';
import { sendMessageToChannel, sendMessageToMember } from '../../lib/discord-utils/discord-utils';
import { randomColor } from '../../lib/utils';
import { Feature } from '../ui/console/feature';
import { Console } from '../ui/console/console';
import type { RolePermission } from '../commons';

export type PollInfo = {
    type: string;
    title: string;
    question: string;
    emojiName: EmojiIdentifierResolvable;
    /** <Emoji String, Description> */
    responses: Collection<EmojiIdentifierResolvable, string>;
}

/**
 * A workshop is an activity with a TA system to help users with questions.
 * The TA system has two options, regular or advanced. Regular option involves TAs reaching out via DMs to users while advanced option 
 * involves users joining a voice channel to receive help. The advanced option is only recommended with knowledgeable discord users.
 * It also has polls the TAs can send to learn basic knowledge from the audience.
 * @extends Activity
 */
 export class Workshop extends Activity {

    TARoles: Collection<String, Role>;
    /** True if the assistance protocol is low tech. */
    isLowTechSolution: boolean;
    /** Channel Name - Channel */
    TAChannels: Collection<String, TextChannel | VoiceChannel>;

    /** Channel where TAs get the questions asked. */
    private _TAConsoleChannel?: TextChannel;
    private _waitlistEmbedMsg?: Message;
    private _ticketManager?: TicketManager;
    /** Channel where hackers ask questions. */
    private _assistanceChannel?: TextChannel;
    initialized: boolean;

    /** User ID - Username */
    waitlist: Collection<Snowflake, String>;
    /** Poll type - PollInfo */
    polls: Collection<String, PollInfo>;

    get TAConsoleChannel() {
        if (!this.initialized) throw "TA Console channel not available, you have to initialize first!";
        return this._TAConsoleChannel!;
    }
    get ticketManager() {
        if (!this.initialized || !this._ticketManager) throw "Ticket Manger not availabe, you must iniialize and low tech solution must be on!";
        return this._ticketManager!;
    }
    get assistanceChannel() {
        if (!this.initialized) throw "TA Console channel not available, you have to initialize first!";
        return this._assistanceChannel!;
    }
    get waitlistEmbedMsg() {
        if (!this._waitlistEmbedMsg) throw "You must send consoles first!";
        return this._waitlistEmbedMsg;
    }


    /**
     * 
     * @constructor 
     * @param isLowTechSolution
     * @param TARoles - roles with TA permissions
     */
    constructor({activityName, guild, roleParticipants, botGuild}: ActivityInfo, isLowTechSolution: boolean = true, TARoles: Collection<string, Role>) {
        super({activityName, guild, roleParticipants, botGuild});

        this.TARoles = TARoles || new Collection();

        this.isLowTechSolution = isLowTechSolution;
        this.TAChannels = new Collection();
        this.waitlist = new Collection();
        this.polls = new Collection();
        this.initialized = false;
    }


    /**
     * Initializes the workshop and adds the ta console, ta banter and assistance channel.
     * @override
     */
    async init() {
        await super.init();

        this._TAConsoleChannel = await this.addTAChannel('_🧑🏽‍🏫ta-console', {
            type: 'GUILD_TEXT',
            topic: 'The TA console, here TAs can chat, communicate with the workshop lead, look at the wait list, and send polls!',
        }) as TextChannel;

        this.addTAChannel('_ta-banter', {
            topic: 'For TAs to talk without cluttering the console.',
        });

        this._assistanceChannel = await this.room.addTextChannel({
            name: '🙋🏽assistance', 
            info: {
                type: 'GUILD_TEXT',
                topic: 'For hackers to request help from TAs for this workshop, please don\'t send any other messages!'
            },
            isSafe: true,
        });

        this.botGuild.blackList.set(this._assistanceChannel.id, 3000);
        this.botGuild.save();

        if (this.isLowTechSolution) {
            this._ticketManager = new TicketManager(this, {
                ticketCreatorInfo: {
                    channel: this._assistanceChannel,
                },
                ticketDispatcherInfo: {
                    channel: await this.room.addTextChannel({
                        name: '_Incoming Tickets',
                        isSafe: true,
                    }),
                    takeTicketEmoji: '👍',
                    joinTicketEmoji: '☝️',
                    reminderInfo: {
                        isEnabled: true,
                        time: 5,
                        reminders: new Collection(),
                    },
                    mainHelperInfo: {
                        role: this.TARoles.first()!,
                        emoji: '✋',
                    },
                    embedCreator: (ticket) => new MessageEmbed()
                        .setTitle(`New Ticket - ${ticket.id}`)
                        .setDescription(`<@${ticket.group.first()?.id}> has a question: ${ticket.question}`)
                        .setTimestamp(),
                },
                systemWideTicketInfo: {
                    garbageCollectorInfo: {
                        isEnabled: false,
                        inactivePeriod: 10,
                        bufferTime: 15
                    },
                    isAdvancedMode: false,
                }
            });
        }

        // winston.loggers.get(this.guild.id).event(`The activity ${this.name} was transformed to a workshop.`, {event: 'Activity'});

        return this;
    }


    /**
     * Adds extra workshop features, plus the regular features. Also adds default polls.
     * @override
     */
    protected addDefaultFeatures() {
        this.addDefaultPolls();

        let localFeatures: Feature[] = [];

        this.polls.forEach((pollInfo) => localFeatures.push(new Feature({
            name: pollInfo.title,
            description: `Asks the question: ${pollInfo.title} - ${pollInfo.question}`,
            emojiResolvable: pollInfo.emojiName,
            callback: (user, _reaction, stopInteracting, console) => this.sendPoll(pollInfo.type, console.channel as TextChannel, user.id).then(() => stopInteracting()),
        })));

        localFeatures.forEach(feature => this.adminConsole.addFeature(feature));

        return super.addDefaultFeatures();
    }


    /**
     * Adds the default polls to the polls list.
     */
    protected addDefaultPolls() {
        /** @type {PollInfo[]} */
        let localPolls: PollInfo[] = [
            {
                title: 'Speed Poll!',
                type: 'Speed Poll',
                emojiName: '🏎️',
                question: 'Please react to this poll!',
                responses: new Collection([['🐢', 'Too Slow?'], ['🐶', 'Just Right?'], ['🐇', 'Too Fast?']]),
            },
            {
                title: 'Difficulty Poll!',
                type: 'Difficulty Poll',
                emojiName: '✍️',
                question: 'Please react to this poll! If you need help, go to the assistance channel!',
                responses: new Collection([['🐢', 'Too Hard?'], ['🐶', 'Just Right?'], ['🐇', 'Too Easy?']]),
            },
            {
                title: 'Explanation Poll!',
                type: 'Explanation Poll',
                emojiName: '🧑‍🏫',
                question: 'Please react to this poll!',
                responses: new Collection([['🐢', 'Hard to understand?'], ['🐶', 'Meh explanations?'], ['🐇', 'Easy to understand?']]),
            }
        ];

        localPolls.forEach(pollInfo => this.polls.set(pollInfo.type, pollInfo));
    }
    

    /**
     * Will send all the consoles the workshop needs to work.
     * @async
     */
    async sendConsoles() {
        let mentorColor = randomColor();

        const TAInfoEmbed = new MessageEmbed()
            .setTitle('TA Information')
            .setDescription('Please read this before the workshop starts!')
            .setColor(`#${mentorColor}`);
        this.isLowTechSolution ? TAInfoEmbed.addField('Ticketing System is turned on!', `* Tickets will be sent to <#${this.ticketManager.ticketDispatcherInfo.channel.id}>
            \n* React to the ticket message and send the user a DM by clicking on their name`) :
            TAInfoEmbed.addField('Advanced Voice Channel System is turned on!', `* Users who need help will be listed in a message on channel <#${this.TAConsoleChannel}>
                \n* Users must be on the general voice channel to receive assistance
                \n* You must be on a private voice channel to give assistance
                \n* When you react to the message, the user will be moved to your voice channel so you can give assistance
                \n* Once you are done, move the user back to the general voice channel`);
        this.TAConsoleChannel.send({embeds: [TAInfoEmbed]});

        // Console for TAs to send polls and stamp distribution
        let TAPollingConsole = new Console({
            title: 'Polling and Stamp Console',
            description: 'Here are some common polls you might want to use!',
            channel: this.TAConsoleChannel,
        });
        this.polls.forEach((pollInfo) => TAPollingConsole.addFeature(new Feature({
            name: pollInfo.title,
            description: `Asks the question: ${pollInfo.title} - ${pollInfo.question}`,
            emojiResolvable: pollInfo.emojiName,
            callback: (user, _reaction, stopInteracting, console: Console) => this.sendPoll(pollInfo.type, console.channel as TextChannel, user.id).then(() => stopInteracting()),
        })));
        TAPollingConsole.addFeature(new Feature({
            name: 'Stamp Distribution',
            description: 'Activate a stamp distribution on the activity\'s text channel',
            emojiResolvable: '📇',
            callback: async (user, _reaction, stopInteracting, _console) => {
                this.distributeStamp(this.room.generalText, user.id);
                stopInteracting();
            }
        }));
        TAPollingConsole.sendConsole();

        if (this.isLowTechSolution) {
            await this.ticketManager.sendTicketCreatorConsole('Get some help from the Workshop TAs!', 
                'React to this message with the emoji and write a quick description of your question. A TA will reach out via DM soon.');
            this.ticketManager.ticketCreatorConsole.addField('Simple or Theoretical Questions', 'If you have simple or theory questions, ask them in the main banter channel!');
        } else {
            // embed message for TA console
            const incomingTicketsEmbed = new MessageEmbed()
                .setColor(`#${mentorColor}`)
                .setTitle('Hackers in need of help waitlist')
                .setDescription('* Make sure you are on a private voice channel not the general voice channel \n* To get the next hacker that needs help click 🤝');
            this.TAConsoleChannel.send({embeds: [incomingTicketsEmbed]}).then(message => this.incomingTicketsHandler(message));

            // where users can request assistance
            const outgoingTicketEmbed = new MessageEmbed()
                .setColor(this.botGuild.colors.embedColor)
                .setTitle(this.name + ' Help Desk')
                .setDescription('Welcome to the ' + this.name + ' help desk. There are two ways to get help explained below:')
                .addField('Simple or Theoretical Questions', 'If you have simple or theory questions, ask them in the main banter channel!')
                .addField('Advanced Question or Code Assistance', 'If you have a more advanced question, or need code assistance, click the 🧑🏽‍🏫 emoji for live TA assistance! Join the ' +  this.room.generalVoice.name + ' voice channel if not already there!');
            this.assistanceChannel.send({embeds: [outgoingTicketEmbed]}).then(message => this.outgoingTicketHandler(message));
        }
    }


    /**
     * Adds a channel to the activity, ask if it will be for TAs or not.
     * @param {TextChannel} channel - channel to prompt user
     * @param {String} userId - user to prompt for channel info
     * @override
     */
    async addChannel(channel: TextChannel, userId: string) {
        // ask if it will be for TA
        let isTa = await SpecialPrompt.boolean({ prompt: 'Is this channel for TAs?', channel, userId });

        if (isTa) {
            let newChannel = await super.addChannel(channel, userId);
            await Promise.all(this.getTAChannelPermissions().map(rolePermission => newChannel.permissionOverwrites.create(rolePermission.id, rolePermission.permissions)));
            this.TAChannels.set(newChannel.name, newChannel);
            return newChannel;
        } else {
            return super.addChannel(channel, userId);
        }
    }


    /**
     * Creates a channel only available to TAs.
     * @param name 
     * @param info
     */
    async addTAChannel(name: string, info: GuildChannelCreateOptions): Promise<TextChannel | VoiceChannel> {
        let channel;
        if (info.type === 'GUILD_TEXT') {
            channel = await this.room.addTextChannel({name, info, permissions: this.getTAChannelPermissions()});
        } else {
            info.type = 'GUILD_VOICE';
            channel = await this.room.addVoiceChannel({name, info, permissions: this.getTAChannelPermissions()});
        }
        
        this.TAChannels.set(channel.name, channel);
        return channel;
    }


    /**
     * Returns the perms for a TA Channel
     */
    protected getTAChannelPermissions(): RolePermission[] {
        /** The permissions for the TA channels */
        let TAChannelPermissions = [
            { id: this.botGuild.roleIDs.everyoneRole, permissions: { VIEW_CHANNEL: false } },
        ];

        // add regular activity members to the TA perms list as non tas, so they cant see that channel
        this.room.rolesAllowed.forEach(role => {
            TAChannelPermissions.push({id: role.id, permissions: {VIEW_CHANNEL: false}});

        });

        // Loop over ta roles, give them voice channel perms and add them to the TA permissions list
        this.TARoles.forEach(role => {
            TAChannelPermissions.push({id: role.id, permissions: {VIEW_CHANNEL: true}});
        });

        return TAChannelPermissions;
    }


    /**
     * FEATURES:
     */


    /**
     * Send a poll to a channel! If room has no generalText it will prompt for a channel to use
     * @param type - the type of poll to send
     * @param channel - channel to prompt user what channel to poll in
     * @param userId - user to prompt what channel to poll in
     */
    async sendPoll(type: string, channel: TextChannel, userId: Snowflake) {
        let poll = this.polls.get(type);
        if (!poll) throw new Error('No poll was found of that type!');
        
        // create poll
        let description = poll.question + '\n\n';
        for (const key of poll.responses.keys()) {
            description += '**' + poll.responses.get(key) + '->** ' + key + '\n\n';
        }

        let qEmbed = new MessageEmbed()
            .setColor(this.botGuild.colors.embedColor)
            .setTitle(poll.title)
            .setDescription(description);

        // send poll to general text or prompt for channel
        let pollChannel;
        if ((await this.room.generalText.fetch(true))) pollChannel = this.room.generalText;
        else pollChannel = await ListPrompt.singleListChooser({
            prompt: 'What channel should the poll go to?',
            channel: channel,
            userId: userId
        }, Array.from(this.room.channels.textChannels.values())) as TextChannel;

        pollChannel.send({embeds: [qEmbed]}).then(msg => {
            poll!.responses.forEach((_value, key) => msg.react(key));
        });

        // winston.loggers.get(this.guild.id).event(`Activity named ${this.name} sent a poll with title: ${poll.title} and question ${poll.question}.`, { event: 'Workshop' });
    }

    /**
     * Creates and handles with the emoji reactions on the incoming ticket console embed
     * @param {Message} message 
     */
    incomingTicketsHandler(message: Message) {
        message.pin();
        message.react('🤝');

        this._waitlistEmbedMsg = message;

        // add reaction to get next in this message!
        const getNextCollector = message.createReactionCollector({filter: (reaction, user) => !user.bot && reaction.emoji.name === '🤝'});

        getNextCollector.on('collect', async (reaction, user) => {
            // remove the reaction
            reaction.users.remove(user.id);

            // person to help
            let hackerKey = this.waitlist.firstKey();

            // check that there is someone to help
            if (!hackerKey) {
                return sendMessageToChannel({
                    channel: this.TAConsoleChannel, 
                    message: 'No one to help right now!',
                    userId: user.id,
                    timeout: 5
                });
            }

            // if pullInFunctionality is turned off then then just remove from list
            if (this.isLowTechSolution) {
                // remove hacker from wait list
                this.waitlist.delete(hackerKey);

            } else {
                // grab guild
                let guild = message.guild;
                if (!guild) return;

                // grab the ta and their voice channel
                var ta = guild.members.resolve(user.id);
                if (!ta) return;

                var taVoice = ta.voice.channel;

                // check that the ta is in a voice channel
                if (taVoice === null || taVoice === undefined) {
                    return sendMessageToChannel({
                        channel: this.TAConsoleChannel,
                        message: 'Please join a voice channel to assist hackers.',
                        userId: user.id,
                        timeout: 5
                    });
                }

                // get next user
                this.waitlist.delete(hackerKey);
                var hacker = guild.members.resolve(hackerKey);
                if (!hacker) return;

                // if status mentor in use there are no hackers in list
                if (hacker === undefined) {
                    return sendMessageToChannel({
                        channel: this.TAConsoleChannel,
                        message: 'There are no hackers in need of help!',
                        userId: user.id,
                        timeout: 5
                    });
                }

                try {
                    await hacker.voice.setChannel(taVoice);
                    sendMessageToMember(hacker, 'TA is ready to help you! You are with them now!', true);
                    sendMessageToChannel({
                        channel: this.TAConsoleChannel,
                        message: 'A hacker was moved to your voice channel! Thanks for your help!!!',
                        userId: user.id,
                        timeout: 5
                    });
                } catch (err) {
                    sendMessageToMember(hacker, 'A TA was ready to talk to you, but we were not able to pull you to their voice ' +
                        'voice channel. Try again and make sure you are in the general voice channel!');
                    sendMessageToChannel({
                        channel: this.TAConsoleChannel,
                        message: 'We had someone that needed help, but we were unable to move them to your voice channel. ' +
                        'They have been notified and skipped. Please help someone else!',
                        userId: user.id,
                        timeout: 8
                    });
                }
            }

            // remove hacker from the embed list
            return this.waitlistEmbedMsg.edit({embeds: [this.waitlistEmbedMsg.embeds[0].spliceFields(0, 1)]});
        });
    }

    /**
     * Creates and handles with the emoji reactions on the outgoing ticket console embed
     * @param {Message} message 
     */
    outgoingTicketHandler(message: Message) {
        message.pin();
        message.react('🧑🏽‍🏫');

        // filter collector and event handler for help emoji from hackers
        const helpCollector = message.createReactionCollector({filter: (reaction, user) => !user.bot && reaction.emoji.name === '🧑🏽‍🏫'});

        helpCollector.on('collect', async (reaction, user) => {
            // remove the emoji
            reaction.users.remove(user.id);

            let member = this.guild.members.resolve(user);
            if (!member) return;

            // check that the user is not already on the wait list
            if (this.waitlist.has(user.id)) {
                sendMessageToMember(member, 'You are already on the TA wait list! A TA will get to you soon!', true);
                return;
            } else {
                var position = this.waitlist.size;
                // add user to wait list
                this.waitlist.set(user.id, user.username);
            }

            let oneLiner = await StringPrompt.single({prompt: 'Please send to this channel a one-liner of your problem or question. You have 20 seconds to respond', channel: this.assistanceChannel, userId: user.id });

            const hackerEmbed = new MessageEmbed()
                .setColor(this.botGuild.colors.embedColor)
                .setTitle('Hey there! We got you signed up to talk to a TA!')
                .setDescription('You are number: ' + position + ' in the wait list.')
                .addField(!this.isLowTechSolution ? 'JOIN THE VOICE CHANNEL!' : 'KEEP AN EYE ON YOUR DMs', 
                    !this.isLowTechSolution ? 'Sit tight in the voice channel. If you are not in the voice channel when its your turn you will be skipped, and we do not want that to happen!' :
                        'A TA will reach out to you soon via DM! Have your question ready and try to keep up with the workshop until then!');

            sendMessageToMember(member, {embeds: [hackerEmbed]});

            // update message embed with new user in list
            this.waitlistEmbedMsg.edit({
                embeds: [this.waitlistEmbedMsg.embeds[0].addField(user.username, '<@' + user.id + '> has the question: ' +  oneLiner)]
            });
            
            // send a quick message to let ta know a new user is on the wait list
            sendMessageToChannel({
                channel: this.TAConsoleChannel,
                message: 'A new hacker needs help!',
                timeout: 3
            })
        });
    }
}