import { Collection, EmojiIdentifierResolvable, MessageEmbed, Role, Snowflake, TextChannel, User } from "discord.js";
import { Console } from "../../ui/console/console";
import { Ticket, TicketStatus } from "./ticket";
import type { Activity } from "../../activities/activity";
import { MessagePrompt } from "advanced-discord.js-prompts";
import { Feature } from "../../ui/console/feature";
import { sendMessageToChannel } from "../../../lib/discord-utils/discord-utils";

export type GarbageCollectorInfo = {
    isEnabled: boolean;
    /** number of minutes a ticket channel will be inactive before bot starts to delete it */
    inactivePeriod: number;
    /** number of minutes the bot will wait for a response before deleting ticket */
    bufferTime: number;
}

export type SystemWideTicketInfo = {
    garbageCollectorInfo: GarbageCollectorInfo;
    /**
     * Information about the system being advanced. Advanced mode will create a category with channels for 
     * the users and the helpers. Regular will not create anything and expects the helper to DM the user or users.
     */
    isAdvancedMode: boolean;
}

export type TicketCreatorInfo = {
    /** the channel where users can create a ticket */
    channel: TextChannel;
    /** the console used to let users create tickets */
    console?: Console;
}

export type ReminderInfo = {
    isEnabled: boolean;
    /** how long should I wait to remind helpers */
    time: number;
    /** the timeout reminders mapped by the ticket ID */
    reminders: Collection<number, NodeJS.Timeout>;
}

/** function to create a Discord MessageEmbed for a new ticket sent to the mentor channel */
export type NewTicketEmbedCreator = (ticket: Ticket) => MessageEmbed;

export type MainHelperInfo = {
    role: Role;
    emoji: EmojiIdentifierResolvable;
}

export type TicketDispatcherInfo = {
    /** the channel where tickets are dispatched to */
    channel: TextChannel;
    /** emoji for mentors to accept/take a ticket */
    takeTicketEmoji: EmojiIdentifierResolvable;
    /** emoji for mentors to join a taken ticket */
    joinTicketEmoji: EmojiIdentifierResolvable;
    reminderInfo: ReminderInfo;
    embedCreator: NewTicketEmbedCreator;
    mainHelperInfo: MainHelperInfo;
}

export type MultiRoleInfo = {
    isEnabled: boolean;
    multiRoleSelector: any;
}


/**
 * Represents a real life ticket system that can be used in any setting. It is very versatile so it can be 
 * used with one or many helper types, can edit options, embeds, etc.
 * @class
 */
 export class TicketManager {

    /** <Ticket number (ID), Ticket> */
    tickets: Collection<number, Ticket>;
    /**
     * The number of tickets created.
     * Must be separate as tickets.length since we use this to assign IDs to tickets.
     */
    ticketCount: number;
    parent: Activity;
    ticketCreatorInfo: TicketCreatorInfo;
    ticketDispatcherInfo: TicketDispatcherInfo;
    systemWideTicketInfo: SystemWideTicketInfo;
    multiRoleInfo: MultiRoleInfo;


    /**
     * @constructor
     * @param parent 
     * @param ticketCreatorInfo
     * @param ticketDispatcherInfo
     * @param systemWideTicketInfo
     */
    constructor(parent: Activity, 
        { ticketCreatorInfo, ticketDispatcherInfo, systemWideTicketInfo } : 
        { ticketCreatorInfo: TicketCreatorInfo, ticketDispatcherInfo: TicketDispatcherInfo, systemWideTicketInfo: SystemWideTicketInfo }) {

        this.tickets = new Collection();
        this.ticketCount = 0;
        this.parent = parent;

        this.ticketCreatorInfo = ticketCreatorInfo;

        this.ticketDispatcherInfo = ticketDispatcherInfo;
        this.ticketDispatcherInfo.reminderInfo.reminders = new Collection();

        this.systemWideTicketInfo = systemWideTicketInfo;

        /**
         * Information about the system being multi role, if its the case, it needs a 
         * Multi Role Selector.
         */
        this.multiRoleInfo = {
            isEnabled : false,
            multiRoleSelector : null,
        };
    }

    get ticketCreatorConsole() {
        if (!this.ticketCreatorInfo.console) throw "The console has not been sent for this ticket!";
        return this.ticketCreatorInfo.console;
    }

    /**
     * Sends the ticket creator console.
     * @param title - the ticket creator console title
     * @param description - the ticket creator console description
     * @param color - the ticket creator console color, hex
     */
    sendTicketCreatorConsole(title: string, description: string, color?: string) {
        let featureList: Feature[] = [
            new Feature({
                name: 'General Ticket',
                description: 'A general ticket aimed to all helpers.',
                emojiResolvable: this.ticketDispatcherInfo.mainHelperInfo.emoji,
                callback: (user, _reaction, stopInteracting, console) => this.startTicketCreationProcess(user, this.ticketDispatcherInfo.mainHelperInfo.role, console.channel as TextChannel).then(() => stopInteracting()),
            })
        ];

        let features = new Collection(featureList.map(feature => [feature.emojiResolvable, feature]));

        this.ticketCreatorInfo.console = new Console({ title, description, channel: this.ticketCreatorInfo.channel, features, color });
        return this.ticketCreatorInfo.console.sendConsole();
    }

    /**
     * Adds a new type of ticket, usually a more focused field, there must be a role associated 
     * to this new type of ticket.
     * @param role - role to add
     * @param typeName
     * @param emoji 
     */
    addTicketType(role: Role, typeName: string, emoji: EmojiIdentifierResolvable) {
        return this.ticketCreatorConsole.addFeature(
            new Feature({
                name: `Question about ${typeName}`,
                description: '---------------------------------',
                emojiResolvable: emoji,
                callback: (user, _reaction, stopInteracting, console) => {
                    return this.startTicketCreationProcess(user, role, console.channel as TextChannel).then(() => stopInteracting());
                }
            })
        );
    }

    /**
     * Prompts a user for more information to create a new ticket for them.
     * @param user - the user creating a ticket
     * @param role 
     * @param channel
     * @async
     */
    async startTicketCreationProcess(user: User, role: Role, channel: TextChannel) {
        // check if role has mentors in it
        if (role.members.size <= 0) {
            sendMessageToChannel({
                channel: channel, 
                userId: user.id, 
                message: 'There are no mentors available with that role. Please request another role or the general role!', 
                timeout: 10
            });
            // winston.loggers.get(this.parent.botGuild._id).userStats(`The cave ${this.parent.name} received a ticket from user ${user.id} but was canceled due to no mentor having the role ${role.name}.`, { event: 'Ticket Manager' });
            return;
        }

        try {
            var promptMsg = await MessagePrompt.prompt({prompt: 'Please send ONE message with: \n* A one liner of your problem ' + 
                                '\n* Mention your team members using @friendName (example: @John).', channel, userId: user.id, cancelable: true, time: 45});
        } catch (error) {
            // winston.loggers.get(this.parent.botGuild._id).warning(`New ticket was canceled due to error: ${error}`, { event: 'Ticket Manager' });
            return;
        }

        let hackers = new Collection<Snowflake, User>();
        hackers.set(user.id, user);
        if (promptMsg.mentions.users.size > 0) hackers = hackers.concat(promptMsg.mentions.users);

        this.newTicket(hackers, promptMsg.cleanContent, role);
    }

    /**
     * Adds a new ticket.
     * @param hackers - <User ID, User>
     * @param question
     * @param roleRequested
     */
    private newTicket(hackers: Collection<Snowflake, User>, question: string, roleRequested: Role) {
        let ticket = new Ticket(hackers, question, roleRequested, this.ticketCount, this);
        this.tickets.set(ticket.id, ticket);

        this.setReminder(ticket);

        this.ticketCount++;

        return ticket.setStatus(TicketStatus.open);
    }

    /**
     * Sets a reminder to a ticket only if reminders are on.
     * @param ticket 
     */
    private setReminder(ticket: Ticket) {
        // if reminders are on, set a timeout to reminder the main role of this ticket if the ticket is still new
        if (this.ticketDispatcherInfo.reminderInfo.isEnabled) {
            let timeout = setTimeout(() => {
                if (ticket.status === TicketStatus.open) {
                    ticket.ticketManagerConsole.changeColor('ff5736');
                    sendMessageToChannel({
                        channel: this.ticketDispatcherInfo.channel,
                        message: `Hello <@&${this.ticketDispatcherInfo.mainHelperInfo.role.id}> ticket number ${ticket.id} still needs help!`,
                        timeout: (this.ticketDispatcherInfo.reminderInfo.time * 60 * 1000)/2
                    })
                    // sets another timeout
                    this.setReminder(ticket);
                }
            }, this.ticketDispatcherInfo.reminderInfo.time * 60 * 1000);

            this.ticketDispatcherInfo.reminderInfo.reminders.set(ticket.id, timeout);
        }
    }

    /**
     * Return the number of tickets in this ticket system.
     * @returns
     */
    getTicketCount(): number {
        return this.tickets.size;
    }

    /**
     * Removes all the tickets from this ticket manager.
     * @param excludeTicketIds - tickets to be excluded
     */
    removeAllTickets(excludeTicketIds: number[] = []) {
        // exclude the tickets
        let ticketsToRemove: Collection<number, Ticket>;
        if (excludeTicketIds.length > 0) ticketsToRemove = this.tickets.filter((_ticket, ticketId) => excludeTicketIds.includes(ticketId));
        else ticketsToRemove = this.tickets;

        return Promise.all(ticketsToRemove.map((_ticket, ticketId) => {
            return this.removeTicket(ticketId);
        }));
    }

    /**
     * Removes tickets by their ids
     * @param ticketIds - ticket ids to remove
     */
    removeTicketsById(ticketIds: number[]) {
        ticketIds.forEach(ticketId => {
            this.removeTicket(ticketId);
        });
    }

    /**
     * Removes all tickets older than the given age.
     * @param minAge - the minimum age in minutes
     * @throws Error when used and advanced mode is turned off
     */
    removeTicketsByAge(minAge: number) {
        // only usable when advanced mode is turned on
        if (!this.systemWideTicketInfo.isAdvancedMode) throw new Error('Remove by age is only available when advanced mode is on!');
        this.tickets.forEach((ticket, ticketId, _tickets) => {
            let now = new Date();

            let timeDif = now.getMilliseconds() - ticket.room.timeCreated.getMilliseconds(); // TODO check this works properly!

            if (timeDif > minAge * 50 * 1000) {
                this.removeTicket(ticketId);
            }
        });
    }

    /**
     * Removes a ticket, deletes the ticket's channels too!
     * @param ticketId - the ticket id to remove
     */
    removeTicket(ticketId: number) {
        // remove the reminder for this ticket if reminders are on
        if (this.ticketDispatcherInfo.reminderInfo.isEnabled && this.ticketDispatcherInfo.reminderInfo.reminders.has(ticketId)) {
            let timeout = this.ticketDispatcherInfo.reminderInfo.reminders.get(ticketId);
            if (timeout) clearTimeout(timeout);
            this.ticketDispatcherInfo.reminderInfo.reminders.delete(ticketId);
        }
        let ticket = this.tickets.get(ticketId);
        if (ticket) {
            return ticket.setStatus(TicketStatus.closed, 'ticket manager closed the ticket');
        }
        return Promise.resolve();
    }
}