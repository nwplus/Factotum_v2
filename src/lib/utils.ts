import { send } from '@sapphire/plugin-editable-commands';
import { Message, MessageEmbed, TextChannel } from 'discord.js';
import { RandomLoadingMessage } from './constants';
import winston from 'winston';

/**
 * Picks a random item from an array
 * @param array The array to pick a random item from
 * @example
 * const randomEntry = pickRandom([1, 2, 3, 4]) // 1
 */
export function pickRandom<T>(array: readonly T[]): T {
	const { length } = array;
	return array[Math.floor(Math.random() * length)];
}

/**
 * Sends a loading message to the current channel
 * @param message The message data for which to send the loading message
 */
export function sendLoadingMessage(message: Message): Promise<typeof message> {
	return send(message, { embeds: [new MessageEmbed().setDescription(pickRandom(RandomLoadingMessage)).setColor('#FF0000')] });
}

/**
 * @returns A random color as a hex string
 */
export function randomColor() {
    return Math.floor(Math.random()*16777215).toString(16);
}

/**
 * Will send a message to a text channel and ping the user, can be deleted after a timeout.
 * @param channel - the channel to send the message to
 * @param userId - the user to tag on the message
 * @param message - the message to send
 * @param timeout - timeout before delete if any, in seconds
 * @async
 */
 export async function sendMsgToChannel(channel: TextChannel, userId: string, message: string, timeout: number = 0) {
    winston.loggers.get(channel.guild.id).verbose(`A message has been sent to the channel ${channel.name} for the user with id ${userId} ${timeout === 0 ? 'with no timeout requested' : 'with a ' + timeout + ' second timeout.'}`);
	
	const message_1 = await channel.send('<@' + userId + '> ' + message);
	await new Promise(() => setTimeout(() => message_1.delete(), timeout * 1000));

	return message_1;

    // if (timeout) msg.delete({timeout: timeout * 1000}); // convert to milliseconds
}

/**
 * will shuffle an array as best and fast as possible
 * @param array - array to shuffle
 */
 export function shuffleArray<T>(array: Array<T>) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}