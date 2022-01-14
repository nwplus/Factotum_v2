import {CategoryChannel, Collection, Guild, GuildChannel, GuildChannelCreateOptions, OverwriteResolvable, Role, Snowflake, TextChannel, User, VoiceChannel} from 'discord.js';
import type { RolePermission } from '../commons';

/**
 * The different channels a room has;
 */
export interface RoomChannels {
    category?: CategoryChannel;
    generalVoice?: VoiceChannel;
    generalText?: TextChannel;
    nonLockedChannel?: TextChannel;
    voiceChannels: Collection<Snowflake, VoiceChannel>
    textChannels: Collection<Snowflake, TextChannel>
    safeChannels: Collection<Snowflake, GuildChannel>
}

/**
 * The room class represents a room where things can occur, a room 
 * consists of a category with voice and text channels. As well as roles 
 * or users allowed to see the room.
 */
export class Room {

    name: string;
    guild: Guild;
    rolesAllowed: Collection<Snowflake, Role>
    usersAllowed: Collection<Snowflake, User>
    isLocked: boolean;
    timeCreated: Date;
    channels: RoomChannels;
    private initialized: boolean;

    constructor(guild: Guild, name: string, 
        rolesAllowed: Collection<Snowflake, Role> = new Collection(), 
        usersAllowed: Collection<Snowflake, User> = new Collection()) {
            
            // Will remove all leading and trailing whitespace and
            // switch spaces for '-'. Will also replace all character except for numbers, letters and '-' 
            // and make it lowercase.
            this.name = name.split(' ').join('-').trim().replace(/[^0-9a-zA-Z-]/g, '').toLowerCase();

            this.guild = guild;
            this.rolesAllowed = rolesAllowed;
            this.usersAllowed = usersAllowed

            this.isLocked = false;
            this.timeCreated = new Date();

            this.channels = {
                voiceChannels: new Collection(),
                textChannels: new Collection(),
                safeChannels: new Collection(),
            };

            this.initialized = false;
    }

    get category() {
        if (!this.initialized) throw "The Room has not been initialized!";
        return this.channels.category!;
    }
    get generalVoice() {
        if (!this.initialized) throw "The Room has not been initialized!";
        return this.channels.generalVoice!;
    }
    get generalText() {
        if (!this.initialized) throw "The Room has not been initialized!";
        return this.channels.generalText!;
    }

    /**
     * Initialize this room by creating the channels in the room.
     * @returns this
     */
    async init() {
        this.channels.category = await this.createCategory();
        this.channels.generalText = await this.addRoomChannel({
            name: this.name.length < 12 ? `${this.name}-banter` : '🖌️activity-banter', 
            info: {
                parent: this.channels.category,
                type: 'GUILD_TEXT',
                topic: 'A general banter channel to be used to communicate with other members, mentors, or staff. The !ask command is available for questions.',
            }
        }) as TextChannel;
        this.channels.generalVoice = await this.addRoomChannel({
            name: this.name.length < 12 ? `${this.name}-room` : '🗣️activity-room', 
            info: {
                parent: this.channels.category,
                type: 'GUILD_VOICE',
            }
        }) as VoiceChannel;
        this.initialized = true;
        return this;
    }

    /**
     * Helper function to create the room category with the correct permissions.
     * @returns a category with the activity name
     * @async
     * @private
     */
     private async createCategory(): Promise<CategoryChannel> {
        let position = this.guild.channels.cache.filter(channel => channel.type === 'GUILD_CATEGORY').size;
        
        let overwrites: OverwriteResolvable[] = [
            {
                id: this.guild.roles.everyone.id,
                deny: ['VIEW_CHANNEL'],
            }];
        
        this.rolesAllowed.each(role => overwrites.push({ id: role.id, allow: ['VIEW_CHANNEL'] }));
        this.usersAllowed.each(user => overwrites.push({ id: user.id, allow: ['VIEW_CHANNEL'] }));
        return this.guild.channels.create(this.name, {
            type: 'GUILD_CATEGORY',
            position: position >= 0 ? position : 0,
            permissionOverwrites: overwrites
        });
    }

    /**
     * Adds a channels to the room. A text channel by default!
     * @param name - name of the channel to create
     * @param info - one of voice or text
     * @param permissions - the permissions per role to be added to this channel after creation.
     * @param isSafe - true if the channel is safe and cant be removed
     */
     private async addRoomChannel({name, info = {}, permissions = [], isSafe = false} : 
        {name: string, info?: GuildChannelCreateOptions, permissions?: RolePermission[], isSafe?: boolean}) {
        info.parent = info?.parent || this.category;
        info.type = info?.type || 'GUILD_TEXT';
        info.permissionOverwrites = permissions;

        let channel = await this.guild.channels.create(name, info);

        if (isSafe) this.channels.safeChannels.set(channel.id, channel);

        // add channel to correct list
        if (channel.type == 'GUILD_TEXT') {
            this.channels.textChannels.set(channel.id, channel);
        }
        else if (channel.type == 'GUILD_VOICE') {
            this.channels.voiceChannels.set(channel.id, channel);
        }
        return channel;
    }

    /**
     * Adds a text channel to the room.
     * @param name - name of the channel to create
     * @param info - one of voice or text
     * @param permissions - the permissions per role to be added to this channel after creation.
     * @param isSafe - true if the channel is safe and cant be removed
     */
    async addTextChannel({name, info = {}, permissions = [], isSafe = false} : 
        {name: string, info?: GuildChannelCreateOptions, permissions?: RolePermission[], isSafe?: boolean}) {
            info.type = 'GUILD_TEXT'
            return await this.addRoomChannel({name, info, permissions, isSafe}) as TextChannel;
    }

    /**
     * Adds a voice channel to the room.
     * @param name - name of the channel to create
     * @param info - one of voice or text
     * @param permissions - the permissions per role to be added to this channel after creation.
     * @param isSafe - true if the channel is safe and cant be removed
     */
    async addVoiceChannel({name, info = {}, permissions = [], isSafe = false} : 
        {name: string, info?: GuildChannelCreateOptions, permissions?: RolePermission[], isSafe?: boolean}) {
            info.type = 'GUILD_VOICE'
            return await this.addRoomChannel({name, info, permissions, isSafe}) as VoiceChannel;
    }


    /**
     * Remove a channel from the room.
     * @param channelToRemove The channel to remove from the room
     * @param isForced Will remove the channel even if its a safe channel if true
     * @returns The deleted channel
     */
    removeRoomChannel(channelToRemove: VoiceChannel | TextChannel, isForced = false) {
        if (isForced && this.channels.safeChannels.has(channelToRemove.id)) throw Error('Can\'t remove that channel.');

        if (channelToRemove.type === 'GUILD_TEXT') this.channels.textChannels.delete(channelToRemove.id);
        else this.channels.voiceChannels.delete(channelToRemove.id);

        this.channels.safeChannels.delete(channelToRemove.id);

        return channelToRemove.delete();
    }

    /**
     * Deletes the room and all the channels in it!
     * @returns A promise that will resolve when all the channels are gone
     */
    delete() {
        // only delete channels if they were created!
        if (this.initialized) {
            var listOfChannels = Array.from(this.category.children.values());

            return Promise.all([listOfChannels.map(channel => channel.delete()), this.category.delete()]);
        }
        return Promise.resolve();
    }

    /**
     * Archives all the text channels to the given archive category, deletes all other channels.
     * @param archiveCategory 
     * @returns Promise that resolves when all channels are moved and/or deleted. You must call botGuild.save()!
     */
    archive(archiveCategory: CategoryChannel) {
        // move all text channels to the archive and rename with activity name
        // remove all voice channels in the category one at a time to not get a UI glitch
        if (!this.initialized) return;

        var listOfChannels = Array.from(this.category.children.values());

        return Promise.all([
            listOfChannels.map(channel => {
                if (channel.type === 'GUILD_TEXT') {
                    let channelName = channel.name;
                    return Promise.all([channel.setName(`${this.name}-${channelName}`), channel.setParent(archiveCategory)]);
                }
                return channel.delete();
            }),
            this.category.delete()
        ]);
    }

    /**
     * Locks the room for all roles except for a text channel. To gain access users must be allowed access
     * individually.
     * @returns The non locked channel where users can unlock the room.
     */
    async lockRoom() {
        if (!this.initialized) return Promise.resolve();

        // set category private
        this.rolesAllowed.forEach((role) => this.channels!.category!.permissionOverwrites.create(role, { VIEW_CHANNEL: false }));

        /** @type {TextChannel} */
        this.channels.nonLockedChannel = await this.addRoomChannel({
            name: 'Activity Rules START HERE', 
            info: { type: 'GUILD_TEXT' }, 
            permissions: this.rolesAllowed.map((role) => ({ id: role.id, permissions: { VIEW_CHANNEL: true, SEND_MESSAGES: false, }})), 
            isSafe: true}) as TextChannel;
        this.channels.safeChannels.set(this.channels.nonLockedChannel.id, this.channels.nonLockedChannel);

        this.isLocked = true;

        return this.channels.nonLockedChannel;
    }

    /**
     * Gives access to the room to a role.
     * @param role - role to give access to
     */
     giveRoleAccess(role: Role) {
        this.rolesAllowed.set(role.id, role);

        if (this.isLocked && this.channels.nonLockedChannel) {
            return this.channels.nonLockedChannel.permissionOverwrites.create(role.id, { VIEW_CHANNEL: true, SEND_MESSAGES: false });
        } else {
            if (this.initialized) return this.category.permissionOverwrites.create(role.id, { VIEW_CHANNEL: true });
            return Promise.resolve();
        }
    }

    /**
     * Gives access to a user
     * @param user - user to give access to
     */
     giveUserAccess(user: User) {
        this.usersAllowed.set(user.id, user);
        if (this.initialized) return this.category.permissionOverwrites.create(user.id, { VIEW_CHANNEL: true, SEND_MESSAGES: true });
        return Promise.resolve();
    }

    /**
     * Removes access to a user to see this room.
     * @param user - the user to remove access to
     */
    removeUserAccess(user: User) {
        this.usersAllowed.delete(user.id);
        if (this.initialized) return this.category.permissionOverwrites.edit(user.id, { VIEW_CHANNEL: false, SEND_MESSAGES: false});
        return Promise.resolve();
    }

}