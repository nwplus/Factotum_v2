import { Collection, Role, Snowflake, User } from "discord.js";
import { Console } from '../../ui/console/console';
import { Feature } from "../../ui/console/feature";
import { Room } from '../../ui/room';
import { sendMessageToChannel } from '../../../lib/discord-utils/discord-utils';
import { TicketManager } from "./ticket-manager";

/**
 * All the consoles sent out.
 * GroupLeader -> sent via DM to leader, they can cancel the ticket from there
 * ticketManager -> sent to the helper channel
 * ticketRoom -> sent to the ticket room once created for users to leave
 */
export type TicketConsoles = {
    groupLeader: Console;
    /**  Message sent to incoming ticket channel for helpers to see. */
    ticketManager: Console; 
    /** The message with the information embed sent to the ticket channel once the ticket is open. */
    ticketRoom: Console;
}

export type TicketGarbageInfo = {
    /** Interval ID for when there are no more helpers in the ticket */
    noHelperInterval: number;
    /** Flag to check if a deletion sequence has already been triggered by all mentors leaving the ticket; if so, there will not be
     * another sequence started for inactivity */
    mentorDeletionSequence: boolean;
    /** Flag for whether this ticket is excluded from automatic garbage collection */
    exclude: boolean;
}

export enum TicketStatus {
    /** Ticket is open for someone to take. */
    new = 'new',
    /** Ticket has been dealt with and is closed. */
    closed = 'closed',
    /** Ticket is being handled by someone. */
    taken = 'taken',
}

export class Ticket {

    id: number;
    room: Room;
    question: string;
    requestedRole: Role;
    /** All the group members, group leader should be the first one!
     *  User ID - User */
    group: Collection<Snowflake, User>;
    /** User ID - User */
    helpers: Collection<Snowflake, User>;
    consoles: TicketConsoles;
    garbageCollectorInfo: TicketGarbageInfo;
    status: TicketStatus;
    ticketManager: TicketManager;

    /**
     * @param hackers 
     * @param question 
     * @param requesterRole
     * @param ticketNumber
     * @param ticketManager 
     */
    constructor(hackers: Collection<string, User>, question: string, requestedRole: Role, ticketNumber: number, ticketManager: TicketManager) {

        /**
         * Ticket number
         * @type {Number}
         */
        this.id = ticketNumber;

        /**
         * The room this ticket will be solved in.
         * @type {Room}
         */
        this.room = ticketManager.systemWideTicketInfo.isAdvancedMode ? 
            new Room(ticketManager.parent.guild, ticketManager.parent.botGuild, `Ticket-${ticketNumber}`, new Collection(), hackers.clone()) : 
            null;

        /**
         * Question from hacker
         * @type {String}
         */
        this.question = question;

        /**
         * @type {Role}
         */
        this.requestedRole = requestedRole;

        /**
         * 
         * @type {Collection<String, User>} - <ID, User>
         * Must clone the Map since we edit it.
         */
        this.group = hackers.clone();

        /**
         * Mentors who join the ticket
         * @type {Collection<String, User>} - <ID, User>
         */
        this.helpers = new Collection();

        
        this.consoles = {
            groupLeader: null,
            ticketManager: null,
            ticketRoom: null,
        };

        /**
         * Garbage collector info.
         * @type {TicketGarbageInfo}
         */
        this.garbageCollectorInfo = {
            noHelperInterval: null,
            mentorDeletionSequence: false,
            exclude: false,
        };

        /**
         * The status of this ticket
         * @type {Ticket.STATUS}
         */
        this.status = null;

        /**
         * @type {TicketManager}
         */
        this.ticketManager = ticketManager; 
    }

    /**
     * This function is called by the ticket's Cave class to change its status between include/exclude for automatic garbage collection.
     * If a previously excluded ticket is re-included, the bot starts listening for inactivity as well.
     * @param {Boolean} exclude - true if ticket is now excluded from garbage collection, false if not
     */
    async includeExclude(exclude: boolean) {
        // oldExclude saves the previous inclusion status of the ticket
        var oldExclude = this.garbageCollectorInfo.exclude;
        // set excluded variable to new status
        this.garbageCollectorInfo.exclude = exclude;

        // if this ticket was previously excluded and is now included, start the listener for inactivity
        if (oldExclude && !exclude) {
            this.startChannelActivityListener();
        }
    }

    /**
     * Change the status of this ticket.
     * @param status - one of TicketStatus
     * @param reason - the reason for the change
     * @param user - user involved with the status change
     */
    async setStatus(status: TicketStatus, reason: string = '', user?: User) {
        this.status = status;
        
        switch(status) {
            case TicketStatus.new:
                // let user know that ticket was submitted and give option to remove ticket
                await this.contactGroupLeader();

                this.newStatusCallback();
                break;

            case TicketStatus.taken:
                if (this.ticketManager.systemWideTicketInfo.isAdvancedMode) await this.advancedTakenStatusCallback(user);
                else await this.basicTakenStatusCallback(user);
                break;
            case TicketStatus.closed:
                this.delete(reason);
                break;
        }
    }

    /**
     * The new ticket status callback creates the ticket manager helper console and sends it to the incoming tickets channel.
     */
    private async newStatusCallback() {
        const ticketManagerMsgEmbed = this.ticketManager.ticketDispatcherInfo.embedCreator(this);

        this.consoles.ticketManager = new Console({
            title: ticketManagerMsgEmbed.title,
            description: ticketManagerMsgEmbed.description,
            channel: this.ticketManager.ticketDispatcherInfo.channel,
            color: '#fff536'
        });

        ticketManagerMsgEmbed.fields.forEach((embedField => {
            this.consoles.ticketManager.addField(embedField.name, embedField.value, embedField.inline);
        }));

        let joinTicketFeature = new Feature({
            name: 'Can you help them?',
            description: 'If so, react to this message with the emoji!',
            emoji: this.ticketManager.ticketDispatcherInfo.takeTicketEmoji,
            callback: (user, _reaction, stopInteracting) => {
                if (this.status === TicketStatus.new) {
                    this.setStatus(TicketStatus.taken, 'helper has taken the ticket', user);
                }
                stopInteracting();
            }
        });

        this.consoles.ticketManager.addFeature(joinTicketFeature);

        this.consoles.ticketManager.sendConsole(`<@&${this.requestedRole.id}>`);
    }

    /**
     * Contacts the group leader and sends a console with the ability to remove the ticket.
     */
    private async contactGroupLeader() {
        let removeTicketEmoji = '⚔️';
        this.consoles.groupLeader = new Console({
            title: 'Ticket was Successful!',
            description: `Your ticket to the ${this.ticketManager.parent.name} group was successful! It is ticket number ${this.id}`,
            channel: await this.group.first().createDM(),
            features: new Collection([
                [removeTicketEmoji, new Feature({
                    name: 'Remove the ticket',
                    description: 'React to this message if you don\'t need help any more!',
                    emoji: removeTicketEmoji,
                    callback: (_user, _reaction, _stopInteracting) => {
                        // make sure user can only close the ticket if no one has taken the ticket
                        if (this.status === TicketStatus.new) this.setStatus(TicketStatus.closed, 'group leader closed the ticket');
                    },
                })]
            ]),
            collectorOptions: { max: 1 }
        });
        this.consoles.groupLeader.sendConsole();
    }

    /**
     * Callback for status change to taken when ticket manager is NOT in advanced mode.
     * @param helper - the user who is taking the ticket
     */
    async basicTakenStatusCallback(helper: User) {
        this.addHelper(helper);

        // edit ticket manager helper console with mentor information
        await this.consoles.ticketManager.addField('This ticket is being handled!', `<@${helper.id}> is helping this team!`);
        await this.consoles.ticketManager.changeColor('#36c3ff');

        // update dm with user to reflect that their ticket has been accepted
        this.consoles.groupLeader.addField('Your ticket has been taken by a helper!', 'Expect a DM from a helper soon!');
        this.consoles.groupLeader.stopConsole();
    }

    /**
     * Callback for status change for when the ticket is taken by a helper.
     * @param helper - the helper user
     */
    private async advancedTakenStatusCallback(helper: User) {
        await this.room.init();

        // add helper and clear the ticket reminder timeout
        this.addHelper(helper);

        // edit ticket manager helper console with mentor information
        await this.consoles.ticketManager.addField('This ticket is being handled!', `<@${helper.id}> is helping this team!`);
        await this.consoles.ticketManager.changeColor('#36c3ff');

        let takeTicketFeature = new Feature({
            name: 'Still want to help?',
            description: `Click the ${this.ticketManager.ticketDispatcherInfo.joinTicketEmoji.toString()} emoji to join the ticket!`,
            emoji: this.ticketManager.ticketDispatcherInfo.joinTicketEmoji,
            callback: (user, _reaction, stopInteracting) => {
                if (this.status === TicketStatus.taken) this.helperJoinsTicket(user);
                stopInteracting();
            }
        });
        await this.consoles.ticketManager.addFeature(takeTicketFeature);

        // update dm with user to reflect that their ticket has been accepted
        this.consoles.groupLeader.addField('Your ticket has been taken by a helper!', 'Please go to the corresponding channel and read the instructions there.');
        this.consoles.groupLeader.stopConsole();

        // send message mentioning all the parties involved so they get a notification
        let notificationMessage = '<@' + helper.id + '> ' + Array.from(this.group.values()).join(' ');
        sendMessageToChannel({
            channel: this.room.channels.generalText!,
            message: notificationMessage,
            timeout: 15
        });

        let leaveTicketEmoji = '👋🏽';

        this.consoles.ticketRoom = new Console({
            title: 'Original Question',
            description: `<@${this.group.first().id}> has the question: ${this.question}`,
            channel: this.room.channels.generalText,
            color: this.ticketManager.parent.botGuild.colors.embedColor,
        });

        this.consoles.ticketRoom.addField('Thank you for helping this team.', `<@${helper.id}> best of luck!`);
        this.consoles.ticketRoom.addFeature(
            new Feature({
                name: 'When done:',
                description: `React to this message with ${leaveTicketEmoji} to lose access to these channels!`,
                emoji: leaveTicketEmoji,
                callback: (user, _reaction, stopInteracting) => {
                    // delete the mentor or the group member that is leaving the ticket
                    this.helpers.delete(user.id);
                    this.group.delete(user.id);

                    this.room.removeUserAccess(user);

                    // if all hackers are gone, delete ticket channels
                    if (this.group.size === 0) {
                        this.setStatus(TicketStatus.closed, 'no users on the ticket remaining');
                    }

                    // tell hackers all mentors are gone and ask to delete the ticket if this has not been done already 
                    else if (this.helpers.size === 0 && !this.garbageCollectorInfo.mentorDeletionSequence && !this.garbageCollectorInfo.exclude) {
                        this.garbageCollectorInfo.mentorDeletionSequence = true;
                        this.askToDelete('mentor');
                    }

                    stopInteracting();
                }
            })
        );

        this.consoles.ticketRoom.sendConsole();

        //create a listener for inactivity in the text channel
        this.startChannelActivityListener();
    }

    /**
     * Callback for collector for when a new helper joins the ticket.
     * @param {User} helper - the new helper user
     * @private
     */
    helperJoinsTicket(helper: User) {
        this.addHelper(helper, this.garbageCollectorInfo.noHelperInterval);

        sendMessageToChannel({
            channel: this.room.channels.generalText,
            message: 'Has joined the ticket!',
            userId: helper.id, 
            timeout: 10
        });

        // update the ticket manager and ticket room embeds with the new mentor
        this.consoles.ticketManager.addField('More hands on deck!', '<@' + helper.id + '> Joined the ticket!');
        this.consoles.ticketRoom.addField('More hands on deck!', '<@' + helper.id + '> Joined the ticket!');
    }

    /**
     * Adds a helper to the ticket.
     * @param user - the user to add to the ticket as a helper
     * @param timeoutId - the timeout to clear due to this addition
     */
    private addHelper(user: User, timeoutId?: number) {
        this.helpers.set(user.id, user);
        if (this.room) this.room.giveUserAccess(user);
        if (timeoutId) clearTimeout(timeoutId);
    }

    /**
     * Main deletion sequence: mentions and asks hackers if ticket can be deleted, and deletes if there is no response or indicates that
     * it will check in again later if someone does respond
     * @param {String} reason - 'mentor' if this deletion sequence was initiated by the last mentor leaving, 'inactivity' if initiated by
     * inactivity in the text channel
     * @private
     */
    async askToDelete(reason: string) {
        // assemble message to send to hackers to verify if they still need the ticket
        let msgText = `${this.group.map(user => '<@' + user.id + '>').join(' ')} `;
        if (reason === 'inactivity') {
            msgText += `${this.helpers.map(user => '<@' + user.id + '>').join(' ')} Hello! I detected some inactivity on this channel and wanted to check in.\n`;
        } else if (reason === 'mentor') {
            msgText += 'Hello! Your mentor(s) has/have left the ticket.\n';
        }

        let warning = await this.room.channels.generalText.send(`${msgText} If the ticket has been solved, please click the 👋 emoji above 
            to leave the channel. If you need to keep the channel, please click the emoji below, 
            **otherwise this ticket will be deleted in ${this.ticketManager.systemWideTicketInfo.garbageCollectorInfo.bufferTime} minutes**.`);

        await warning.react('🔄');

        // reaction collector to listen for someone to react with the emoji for more time
        const deletionCollector = warning.createReactionCollector({ 
            filter: (reaction, user) => !user.bot && reaction.emoji.name === '🔄',
            time: this.ticketManager.systemWideTicketInfo.garbageCollectorInfo.bufferTime * 60 * 1000, max: 1 
        });
        
        deletionCollector.on('end', async (collected) => {
            // if a channel has already been deleted by another process, stop this deletion sequence
            if (collected.size === 0 && !this.garbageCollectorInfo.exclude && this.status != TicketStatus.closed) { // checks to see if no one has responded and this ticket is not exempt
                this.setStatus(TicketStatus.closed, 'inactivity');
            } else if (collected.size > 0) {
                await this.room.channels.generalText.send('You have indicated that you need more time. I\'ll check in with you later!');

                // set an interval to ask again later
                //this.garbageCollectorInfo.noHelperInterval = setInterval(() => this.askToDelete(reason), this.ticketManager.systemWideTicketInfo.garbageCollectorInfo.inactivePeriod * 60 * 1000);
                this.startChannelActivityListener();
            }
        });
    }

    /**
     * Uses a message collector to see if there is any activity in the room's text channel. When the collector ends, if it collected 
     * no messages and there is no one on the voice channels then ask to delete and listen once again.
     * @async
     * @private
     */
    async startChannelActivityListener() {
        // message collector that stops when there are no messages for inactivePeriod minutes
        const activityListener = this.room.channels.generalText.createMessageCollector({ 
            idle: this.ticketManager.systemWideTicketInfo.garbageCollectorInfo.inactivePeriod * 60 * 1000,
            filter: m => !m.author.bot,
        });
        activityListener.on('end', async collected => {
            if (collected.size === 0 && this.room.channels.generalVoice.members.size === 0 && this.status === TicketStatus.taken) {
                await this.askToDelete('inactivity');
                
                // start listening again for inactivity in case they ask for more time
                //this.startChannelActivityListener(); 
            } else {
                this.startChannelActivityListener(); 
            }
        });
    }

    /**
     * Deletes the ticket, the room and the intervals.
     * @param {String} reason - the reason to delete the ticket
     * @private
     */
    delete(reason: string) {
        // update ticketManager msg and let user know the ticket is closed
        this.consoles.ticketManager.addField(
            'Ticket Closed', 
            `This ticket has been closed${reason ? ' due to ' + reason : '!! Good job!'}`
        );
        this.consoles.ticketManager.changeColor('#43e65e');
        this.consoles.ticketManager.stopConsole();
        
        this.consoles.groupLeader.addField(
            'Ticket Closed!', 
            `Your ticket was closed due to ${reason}. If you need more help, please request another ticket!`
        );
        this.consoles.groupLeader.stopConsole();

        // delete the room, clear intervals
        if (this.room) this.room.delete();
        clearInterval(this.garbageCollectorInfo.noHelperInterval);
        
        if (this.consoles?.ticketRoom) this.consoles.ticketRoom.stopConsole();
    }
}
