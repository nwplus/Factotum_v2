import { Guild, HexColorString, OverwriteResolvable, Permissions, Role, Snowflake } from "discord.js";
import { discordLog } from "../lib/discord-utils/discord-utils";
import { Document, Field } from "ts-mongodb-orm";

export type BotGuildRoleIDs = {
    memberRole: Snowflake,
    staffRole: Snowflake,
    adminRole: Snowflake,
    everyoneRole: Snowflake
}

export type BotGuildChannelIDs = {
    adminConsole: Snowflake,
    adminLog: Snowflake,
    botSupportChannel: Snowflake,
    archiveCategory: Snowflake,
}


@Document({collectionName: "botguilds"})
export class BotGuild {
    
    @Field()
    public roleIDs: {
        memberRole: string,
        staffRole: string,
        adminRole: string,
        everyoneRole: string,
    };

    @Field()
    public channelIDs: {
        adminConsole: string,
        adminLog: string,
        botSupportChannel: string,
        archiveCategory: string,
    };

    @Field()
    public verification: {
        isEnabled: boolean,
        guestRoleID?: string,
        welcomeChannelID?: string,
        welcomeSupportChannelID?: string,
        /** <Type, RoleId> */
        verificationRoles: Map<string, string>
    } = {
        isEnabled: false,
        verificationRoles: new Map(),
    };

    @Field()
    public attendance: {
        isEnabled: boolean,
        attendeeRoleID?: string,
    } = {
        isEnabled: false
    };

    @Field()
    public stamps: {
        isEnabled: boolean,
        /** <RoleId, Stamp number> */
        stampRoleIDs: Map<string, number>,
        /** The first stamp role Id given to all users */
        stamp0thRoleId?: string,
        stampCollectionTime: number,
    } = {
        isEnabled: false,
        stampRoleIDs: new Map(),
        stampCollectionTime: 60,
    };

    @Field()
    public report: {
        isEnabled: boolean,
        incomingReportChannelID?: string,
    } = {
        isEnabled: false,
    };

    @Field()
    public announcement: {
        isEnabled: boolean,
        announcementChannelID?: string,
    } = {
        isEnabled: false,
    };

    @Field()
    public ask: {
        isEnabled: boolean,
    } = {
        isEnabled: false,
    };

    /**
     * This is some text
     */
    @Field()
    public blackList: Map<string, number> = new Map();

    /**
     * An object with some nice colors to use!
     */
    @Field()
    public colors: {
        /** @hexColor */
        embedColor: HexColorString,
        /** @hexColor */
        questionEmbedColor: HexColorString,
        /** @hexColor */
        announcementEmbedColor: HexColorString,
        /** @hexColor */
        tfTeamEmbedColor: HexColorString,
        /** @hexColor */
        tfHackerEmbedColor: HexColorString,
        /** @hexColor */
        specialDMEmbedColor: HexColorString, 
    } = {
        embedColor: '#26fff4',
        questionEmbedColor: '#f4ff26',
        announcementEmbedColor: '#9352d9',
        tfTeamEmbedColor: '#60c2e6',
        tfHackerEmbedColor: '#d470cd',
        specialDMEmbedColor: '#fc6b03',
    };

    /**
     * The botGuild id must equal the guild id
     */
    @Field()
    public _id!: string;

    /**
     * True if the bot has been set up and its ready to hack!
     */
    @Field()
    public isSetUpComplete: boolean = false;

    /**
     * The prefix used by the bot in this guild.
     */
    @Field()
    public prefix: string = '!';

    constructor(botGuildRoleIDs: BotGuildRoleIDs, botGuildChannelIDs: BotGuildChannelIDs, guildID: Snowflake) {
        this.roleIDs = botGuildRoleIDs;
        this.channelIDs = botGuildChannelIDs;
        this._id = guildID;
    }

    /**
     * Will set the minimum required information for the bot to work on this guild.
     * @param guild 
     */
    async readyUp(guild: Guild) {
        let adminRole = await guild.roles.fetch(this.roleIDs.adminRole);
        // try giving the admins administrator perms
        try {
            if (adminRole && !adminRole.permissions.has('ADMINISTRATOR')) 
            {
                await adminRole.setPermissions('ADMINISTRATOR');
                await adminRole.setMentionable(true);
            }
        } catch {
            discordLog(guild, 'Was not able to give administrator privileges to the role <@&' + adminRole?.id + '>. Please help me!')
        }

        // staff role set up
        let staffRole = await guild.roles.fetch(this.roleIDs.staffRole);
        if (staffRole) {
            staffRole.setMentionable(true);
            staffRole.setHoist(true);
            staffRole.setPermissions(BotGuild.staffPermissions);
        }
        

        // regular member role setup
        let memberRole = await guild.roles.fetch(this.roleIDs.memberRole);
        if (memberRole) {
            memberRole.setMentionable(false);
            memberRole.setPermissions(BotGuild.memberPermissions);
        }

        // change the everyone role permissions, we do this so that we can lock rooms. For users to see the server when 
        // verification is off, they need to get the member role when greeted by the bot!
        guild.roles.everyone.setPermissions(0n); // no permissions for anything like the guest role

        // create the archive category
        this.channelIDs.archiveCategory = (await this.createArchiveCategory(guild)).id;

        this.isSetUpComplete = true;

        // winston.loggers.get(this._id).event(`The botGuild has run the ready up function.`, {event: "Bot Guild"});
    }

    /**
     * Creates the archive category.
     * @param guild
     */
    private async createArchiveCategory(guild: Guild) {
        let overwrites: OverwriteResolvable[] = [
            {
                id: this.roleIDs.everyoneRole,
                deny: [Permissions.FLAGS.VIEW_CHANNEL]
            },
            {
                id: this.roleIDs.memberRole,
                allow: [Permissions.FLAGS.VIEW_CHANNEL],
            },
            {
                id: this.roleIDs.staffRole,
                allow: [Permissions.FLAGS.VIEW_CHANNEL],
            }
        ];

        // position is used to create archive at the very bottom!
        var position = (guild.channels.cache.filter(channel => channel.type === 'GUILD_CATEGORY')).size;
        return await guild.channels.create(
            '💼archive',
            {
                type: 'GUILD_CATEGORY', 
                position: position + 1,
                permissionOverwrites: overwrites,
            }
            );
    }




    /**
     * Will create the admin channels with the correct roles.
     * @param guild 
     * @param adminRole 
     * @param everyoneRole 
     * @returns - {Admin Console, Admin Log Channel}
     */
     static async createAdminChannels(guild: Guild, adminRole: Role, everyoneRole: Role) {
        let adminCategory = await guild.channels.create('Admins', {
            type: 'GUILD_CATEGORY',
            permissionOverwrites: [
                {
                    id: adminRole.id,
                    allow: Permissions.FLAGS.VIEW_CHANNEL
                },
                {
                    id: everyoneRole.id,
                    deny: [Permissions.FLAGS.VIEW_CHANNEL, Permissions.FLAGS.SEND_MESSAGES, Permissions.FLAGS.CONNECT]
                }
            ]
        });

        let adminConsoleChannel = await guild.channels.create('console', {
            type: 'GUILD_TEXT',
            parent: adminCategory,
        });

        let adminLogChannel = await guild.channels.create('logs', {
            type: 'GUILD_TEXT',
            parent: adminCategory,
        });

        adminCategory.children.forEach(channel => channel.lockPermissions());

        // winston.loggers.get(guild.id).event(`The botGuild has run the create admin channels function.`, {event: "Bot Guild"});

        return {adminConsoleChannel: adminConsoleChannel, adminLog: adminLogChannel};
    }

    /**
     * Staff role permissions.
     * @static
     */
    static staffPermissions = [ Permissions.FLAGS.VIEW_CHANNEL, Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS, Permissions.FLAGS.CHANGE_NICKNAME,
        Permissions.FLAGS.MANAGE_NICKNAMES, Permissions.FLAGS.KICK_MEMBERS, Permissions.FLAGS.BAN_MEMBERS, Permissions.FLAGS.SEND_MESSAGES,
        Permissions.FLAGS.EMBED_LINKS, Permissions.FLAGS.ATTACH_FILES, Permissions.FLAGS.ADD_REACTIONS, Permissions.FLAGS.USE_EXTERNAL_EMOJIS,
        Permissions.FLAGS.MANAGE_MESSAGES, Permissions.FLAGS.READ_MESSAGE_HISTORY, Permissions.FLAGS.CONNECT, Permissions.FLAGS.STREAM,
        Permissions.FLAGS.SPEAK, Permissions.FLAGS.PRIORITY_SPEAKER, Permissions.FLAGS.USE_VAD, Permissions.FLAGS.MUTE_MEMBERS,
        Permissions.FLAGS.DEAFEN_MEMBERS, Permissions.FLAGS.MOVE_MEMBERS];

    /**
     * Admin role permissions.
     * @static
     */
    static adminPermissions = [Permissions.FLAGS.ADMINISTRATOR];

    /**
     * The regular member perms.
     * @static
     */
    static memberPermissions = [ Permissions.FLAGS.VIEW_CHANNEL, Permissions.FLAGS.CHANGE_NICKNAME, Permissions.FLAGS.SEND_MESSAGES, Permissions.FLAGS.ADD_REACTIONS,
        Permissions.FLAGS.READ_MESSAGE_HISTORY, Permissions.FLAGS.CONNECT, Permissions.FLAGS.SPEAK, Permissions.FLAGS.STREAM, Permissions.FLAGS.USE_VAD];
}