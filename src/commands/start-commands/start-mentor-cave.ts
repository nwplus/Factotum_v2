import { ApplyOptions } from '@sapphire/decorators';
import { Command, CommandOptions } from '@sapphire/framework';
import { NumberPrompt, RolePrompt, SpecialPrompt } from 'advanced-discord.js-prompts';
import { Collection, GuildEmoji, Message, ReactionEmoji, Snowflake, TextChannel } from 'discord.js';
import { sendMessageToChannel } from '../../lib/discord-utils/discord-utils';
import { randomColor } from '../../lib/utils';
import { Cave } from '../../objects/activities/cave';
import { BotGuild } from '../../objects/bot-guild';

@ApplyOptions<CommandOptions>({
	description: 'Create the mentor',
    name: 'start-mentor-cave',
})
export class StartMentorCave extends Command {
    
	public async messageRun(message: Message) {
        try {
            if (!message.guild) return;
            const guild = message.guild;
            
            if (message.channel.type != 'GUILD_TEXT') return;
            const channel = message.channel;

            if (!message.member) return;
            const userId = message.member.user.id;

            const botGuild = new BotGuild(
                {
                    memberRole: "930018053343830016",
                    everyoneRole: "926230251422511206",
                    staffRole: "926251554858733578",
                    adminRole: "926233465425383435",
                },
                {
                    adminConsole: "930017828671733800",
                    adminLog: "930017829221187585",
                    botSupportChannel: "930018473927667733",
                    archiveCategory: "930018180263469166",
                },
                "926230251422511206"
            );

            botGuild.stamps = {
                isEnabled: true,
                stampRoleIDs: new Map([
                    ["930019416849141800", 0], ["930019417520226404", 1], ["930019418107420703", 2], 
                    ["930019418765926451", 3], ["930019419726426132", 4], ["930019420464619520", 5], ["930019421148295198", 6], 
                    ["930019421622239253", 7], ["930019422477910016", 8], ["930019423211900948", 9], ["930019423832641556", 10],
                    ["930019423832641556", 11], ["930019424990273557", 12], 
                    ["930019425464234035", 13], ["930019426768683058", 14], ["930019427565592596", 15], ["930019428098248745", 16], 
                    ["930019429184602132", 17], ["930019430124105758", 18], ["930019430770020352", 19], ["930019431055253555", 20]
                    
                ]),
                stampCollectionTime: 300,
                stamp0thRoleId: "930019416849141800"
            };
            botGuild.isSetUpComplete = true;

            if (!message.member.roles.cache.find((role) => role.id === botGuild.roleIDs.adminRole)) return;

            /**
             * @param prompt - message to ask user to choose an emoji for a function
             * 
             * Gets user's reaction and adds them to the emoji collection.
             */
            async function checkForDuplicateEmojis(prompt: string, channel: TextChannel, userId: Snowflake, emojis: Collection<string, GuildEmoji | ReactionEmoji>) {
                let reaction = await SpecialPrompt.singleRestrictedReaction({prompt: prompt, channel: channel, userId: userId}, emojis);
                var emoji = reaction.emoji;
                emojis.set(emoji.identifier, emoji);
                return emoji;
            }

            
            const emojis = new Collection<string, GuildEmoji | ReactionEmoji>(); //collection to keep the names of the emojis used so far, used to check for duplicates

            //ask user for each emoji

            let joinTicketEmoji = await checkForDuplicateEmojis('What is the join ticket emoji?', channel, userId, emojis);
            let giveHelpEmoji = await checkForDuplicateEmojis('What is the give help emoji?', channel, userId, emojis);
            let requestTicketEmoji = await checkForDuplicateEmojis('What is the request ticket emoji?', channel, userId, emojis);
            let addRoleEmoji = await checkForDuplicateEmojis('What is the add mentor role emoji?', channel, userId, emojis);
            let deleteChannelsEmoji = await checkForDuplicateEmojis('What is the delete ticket channels emoji?', channel, userId, emojis);
            let excludeFromAutoDeleteEmoji = await checkForDuplicateEmojis('What is the emoji to opt tickets in/out for the garbage collector?', channel, userId, emojis);

            var role;
            if (await SpecialPrompt.boolean({prompt: 'Have you created the mentor role? If not it is okay, I can make it for you!', channel: channel, userId: userId})) {
                role = await RolePrompt.single({prompt: 'Please mention the mentor role now!', channel: channel, userId: userId});
            } else {
                role = await message.guild.roles.create({
                    name: 'Mentor',
                    color: `#${randomColor()}`,
                });
            }

            const publicRoles = await RolePrompt.multi({ prompt: 'What roles can request tickets?', channel: channel, userId: userId });
            
            const inactivePeriod = await NumberPrompt.single({prompt: 'How long, in minutes, does a ticket need to be inactive for before asking to delete it?',
                    channel: channel, userId: userId});
            var bufferTime = inactivePeriod;

            while (bufferTime >= inactivePeriod) {
                bufferTime = await NumberPrompt.single({prompt: `How long, in minutes, will the bot wait for a response to its request to delete a ticket? Must be less than inactive period: ${inactivePeriod}.`,
                    channel: channel, userId: userId});
            }

            const reminderTime = await NumberPrompt.single({prompt: 'How long, in minutes, shall a ticket go unaccepted before the bot sends a reminder to all mentors?',
                channel: channel, userId: userId});

            const cave = new Cave({
                name: 'Mentor',
                preEmojis: ['🧑🏽🎓'],
                preRoleText: 'M',
                color: 'ORANGE',
                role: role,
                emojis: {
                    joinTicketEmoji: joinTicketEmoji,
                    giveHelpEmoji: giveHelpEmoji,
                    requestTicketEmoji: requestTicketEmoji,
                    addRoleEmoji: addRoleEmoji,
                    deleteChannelsEmoji: deleteChannelsEmoji,
                    excludeFromAutoDeleteEmoji: excludeFromAutoDeleteEmoji,
                },
                times: {
                    inactivePeriod,
                    bufferTime,
                    reminderTime,
                },
                publicRoles: publicRoles,
            }, botGuild, guild);

            await cave.init();
        } catch (error) {
            if (message.channel.type === 'GUILD_TEXT')
                sendMessageToChannel({
                    channel: message.channel,
                    message: 'Due to a prompt cancel, the mentor cave creation was unsuccessful. Error: ' + error,
                    userId: message.member?.user.id,
                    timeout: 5
                });
                console.log(error);
            // winston.loggers.get(message.guild.id).warning(`An error was found but it was handled by not setting up the mentor cave. Error: ${error}`, { event: 'StartMentorCave Command' });
        }
	}
}