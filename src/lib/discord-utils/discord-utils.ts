import winston from "winston";
import { ColorResolvable, Guild, GuildMember, Message, MessageEmbed, MessageOptions, MessagePayload, TextChannel } from "discord.js";

/**
 * Will send a message to a text channel and ping the user, can be deleted after a timeout.
 * @param channel - the channel to send the message to
 * @param userId - the user to tag on the message
 * @param message - the message to send
 * @param timeout - timeout before delete if any, in seconds
 * @async
 */
 export async function sendMessageToChannel({
     channel, message, userId, timeout = 0
 }: {channel: TextChannel, message: string, userId?: string, timeout?: number}) {
    winston.loggers.get(channel.guild.id).verbose(`A message has been sent to the channel ${channel.name} for the user with id ${userId} ${timeout === 0 ? 'with no timeout requested' : 'with a ' + timeout + ' second timeout.'}`);
	
	const message_1 = await channel.send(
        userId ? 
        '<@' + userId + '> ' + message :
        message
        );
	await new Promise(() => setTimeout(() => message_1.delete(), timeout * 1000));

	return message_1;

    // if (timeout) msg.delete({timeout: timeout * 1000}); // convert to milliseconds
}

/**
 * Send a Direct message to a member, option to delete after a few seconds.
 * Helps user fix DM issue if the bot can't reach them over DM.
 * @param member - the user or member to send a DM to
 * @param message - the message to send
 * @param isDelete - weather to delete message after 60 seconds
 * @async
 */
 export function sendMessageToMember(member: GuildMember, message: string | MessagePayload | MessageOptions, isDelete: boolean = false) {
    return member.send(message).then(msg => {
        winston.loggers.get(member?.guild?.id || 'main').verbose(`A DM message was sent to user with id ${member.id}.`);
        if (isDelete === true) {
            return new Promise(() => setTimeout(() => msg.delete(), 6000)) as Promise<Message<boolean>>;
        }
        return msg;
    }).catch(async error => {
        if (error.code === 50007) {
            winston.loggers.get(member?.guild?.id || 'main').warning(`A DM message was sent to user with id ${member.id} but failed, he has been asked to fix this problem!`);
            /* let botGuild; // TODO fix
            if (member?.guild) botGuild = await BotGuild.findById(member.guild.id);
            else {
                winston.loggers.get(member.guild.id).error('While trying to help a user to get my DMs I could not find a botGuild for which this member is in. I could not help him!');
                throw Error(`I could not help ${member.id} due to not finding the guild he is trying to access. I need a member and not a user!`);
            }

            let botSupportChannel = member.guild.channels.resolve(botGuild.channelIDs.botSupportChannel);
            if (botSupportChannel && botSupportChannel.type == 'GUILD_TEXT') {
                botSupportChannel.send('<@' + member.id + '> I couldn\'t reach you :(. Please turn on server DMs, explained in this link: https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings-');
            } */
        } else {
            throw error;
        }
    });
}

export type FieldInfo = {
    title: string;
    description: string;
}

export type EmbedOptions = {
    title: string;
    description: string;
    color?: ColorResolvable;
    fields: FieldInfo[];
}

/**
 * Sends an embed to a user via DM. Title and description are required, color and fields are optional.
 * @param member - member to send embed to
 * @param embedOptions - embed information
 * @param isDelete - should the message be deleted after some time?
 */
 export async function sendEmbedToMember(member: GuildMember, embedOptions: EmbedOptions, isDelete: boolean = false) {
    if (!embedOptions.color) embedOptions.color = '#ff0000';

    let embed = new MessageEmbed().setColor(embedOptions.color)
        .setTitle(embedOptions.title)
        .setDescription(embedOptions.description)
        .setTimestamp();

    if (embedOptions?.fields) embedOptions.fields.forEach((fieldInfo) => embed.addField(fieldInfo.title, fieldInfo.description));

    return sendMessageToMember(member, {embeds: [embed]}, isDelete);
}

/**
 * Log a message on the log channel
 * @param guild - the guild being used
 * @param message - message to send to the log channel
 * @async
 */
 export async function discordLog(guild: Guild, message: string | MessagePayload | MessageOptions) {
    /* let botGuild; // await BotGuild.findById(guild.id); TODO fix!
    if (botGuild.channelIDs.adminLog) {
        let adminLogChannel = guild.channels.cache.get(botGuild.channelIDs.adminLog);
        if (adminLogChannel && adminLogChannel.type == 'GUILD_TEXT') {
            adminLogChannel.send(message);
        }
        winston.loggers.get(guild.id).silly(`The following was logged to discord: ${message}`);
    } */
    // else winston.loggers.get(guild.id).error('I was not able to log something to discord!! I could not find the botGuild or the adminLog channel!');
}