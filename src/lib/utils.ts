import { send } from '@sapphire/plugin-editable-commands';
import { Message, MessageEmbed } from 'discord.js';
import { RandomLoadingMessage } from './constants';

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
 * will shuffle an array as best and fast as possible
 * @param array - array to shuffle
 */
 export function shuffleArray<T>(array: Array<T>) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export type NamedCharRange = 'emoticons' | 'food' | 'animals' | 'expressions';

export const CHAR_RANGE = {
  emoticons: [0x1f600, 0x1f64f],
  food: [0x1f32d, 0x1f37f],
  animals: [0x1f400, 0x1f4d3],
  expressions: [0x1f910, 0x1f92f]
};

export const RandomEmoji = function(range: NamedCharRange = 'emoticons'): string {
  const [max, min] = CHAR_RANGE[range];
  const codePoint = Math.floor(Math.random() * (max - min) + min);
  return String.fromCodePoint(codePoint);
};