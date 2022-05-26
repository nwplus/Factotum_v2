import { ApplyOptions } from '@sapphire/decorators';
import { Command, CommandOptions } from '@sapphire/framework';
import { Message, MessageEmbed } from 'discord.js';
import { sendMessageToChannel } from '../../lib/discord-utils/discord-utils';
import { addRoleToMember, removeRoleToMember } from '../../lib/discord-utils/role-utils';

@ApplyOptions<CommandOptions>({
	description: 'Let users decide their pronouns!',
    name: 'pronouns',
})
export class Pronouns extends Command {
    
	public async messageRun(message: Message) {
        if (message.channel.type != 'GUILD_TEXT') return;
        const guild = message.guild!;

        const sheRole = guild.roles.cache.find(role => role.name === 'she/her');
        const heRole = guild.roles.cache.find(role => role.name === 'he/him');
        const theyRole = guild.roles.cache.find(role => role.name === 'they/them');
        const otherRole = guild.roles.cache.find(role => role.name === 'other pronouns');

        // check to make sure all 4 roles are available
        if (!sheRole || !heRole || !theyRole || !otherRole) {
            sendMessageToChannel({
                channel: message.channel, userId: message.author.id, 
                message: 'Could not find all four roles! Make sure the role names are exactly like stated on the documentation.', 
                timeout: 20
            });
            return;
        }

        var emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

        const embed = new MessageEmbed()
            .setColor('#0DEFE1')
            .setTitle('Set your pronouns by reacting to one of the emojis!')
            .setDescription(
                `${emojis[0]} she/her\n`
                + `${emojis[1]} he/him\n`
                + `${emojis[2]} they/them\n`
                + `${emojis[3]} other pronouns\n`);

        const messageEmbed = await message.channel.send({embeds: [embed]});
        emojis.forEach(emoji => messageEmbed.react(emoji));

        // create collector
        const reactionCollector = messageEmbed.createReactionCollector({
            dispose: true,
            filter: (reaction, user) => user.bot != true && emojis.includes(reaction.emoji.name || reaction.emoji.identifier),
        });

        // on emoji reaction
        reactionCollector.on('collect', async (reaction, user) => {
            const member = await guild.members.fetch(user.id);

            if (reaction.emoji.name === emojis[0]) {
                addRoleToMember(member, sheRole);
            } if (reaction.emoji.name === emojis[1]) {
                addRoleToMember(member, heRole);
            } if (reaction.emoji.name === emojis[2]) {
                addRoleToMember(member, theyRole);
            } if (reaction.emoji.name === emojis[3]) {
                addRoleToMember(member, otherRole);
            }
        });

        reactionCollector.on('remove', async (reaction, user) => {
            const member = await guild.members.fetch(user.id);

            if (reaction.emoji.name === emojis[0]) {
                removeRoleToMember(member, sheRole);
            } if (reaction.emoji.name === emojis[1]) {
                removeRoleToMember(member, heRole);
            } if (reaction.emoji.name === emojis[2]) {
                removeRoleToMember(member, theyRole);
            } if (reaction.emoji.name === emojis[3]) {
                removeRoleToMember(member, otherRole);
            }
        });
	}
}