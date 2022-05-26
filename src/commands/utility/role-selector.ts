import { ApplyOptions } from '@sapphire/decorators';
import { Command, CommandOptions } from '@sapphire/framework';
import { RolePrompt, SpecialPrompt, StringPrompt } from 'advanced-discord.js-prompts';
import type { Message, TextChannel } from 'discord.js';
import { Feature } from '../../objects/ui/console/feature';
import { Console } from '../../objects/ui/console/console';
import { addRoleToMember, checkForRole, removeRoleToMember } from '../../lib/discord-utils/role-utils';
import { sendMessageToChannel } from '../../lib/discord-utils/discord-utils';

@ApplyOptions<CommandOptions>({
	description: 'Let users decide their pronouns!',
    name: 'role-selector',
})
export class RoleSelector extends Command {

	public async messageRun(message: Message) {
        if (message.channel.type != 'GUILD_TEXT') return;
        const guild = message.guild!;
        
        // the emoji for staff to add new transfers
        let newTransferEmoji = '🆕';

        let addTransferFeature = new Feature({
            name: 'Add a Role!',
            emojiResolvable: newTransferEmoji,
            description: 'Add a new emoji to this transfer console! Only staff can select this option!',
            callback: async (user, reaction, stopInteracting, console) => {
                const channel = console.channel;
                const member = await guild.members.fetch(user);
                // staff add new transfer
                if (checkForRole(member, '926251554858733578') || checkForRole(member, '926233465425383435')) { // TODO change to botGUild 
                    
                    try {
                        var role = await RolePrompt.single({
                            prompt: 'What role do you want to add?',
                            channel: channel,
                            userId: user.id
                        });

                        var title = await StringPrompt.single({
                            prompt: 'What is the transfer title?',
                            channel: channel,
                            userId: user.id
                        });

                        var description = await StringPrompt.single({
                            prompt: 'What is the transfer description?',
                            channel: channel,
                            userId: user.id
                        });

                    } catch (error) {
                        stopInteracting(user);
                        return;
                    }
                    
                    let emoji = await SpecialPrompt.singleEmoji({prompt: 'What emoji to you want to use for this transfer?', channel: message.channel as TextChannel, userId: message.author.id});
                    
                    // new feature will add the emoji transfer to the embed
                    let newFeature = new Feature({
                        name: title,
                        description: description,
                        emojiResolvable: emoji,
                        callback: async  (user, _reaction, stopInteracting, console) => {
                            if (console.channel.type === 'GUILD_TEXT') {
                                addRoleToMember(await guild.members.fetch(user.id), role);
                                stopInteracting(user);
                                sendMessageToChannel({
                                    channel: console.channel,
                                    message: 'You have been given the role: ' + role.name,
                                    timeout: 4,
                                    userId: user.id
                                });
                            }
                        },
                        removeCallback: async (user, _reaction, stopInteracting, console) => {
                            if (console.channel.type === 'GUILD_TEXT') {
                                removeRoleToMember(await guild.members.fetch(user.id), role);
                                stopInteracting(user);
                                sendMessageToChannel({
                                    channel: console.channel,
                                    message: 'You have lost the role: ' + role.name,
                                    timeout: 4,
                                    userId: user.id
                                }); 
                            }
                        }
                    });
                    console.addFeature(newFeature);
                }
                
                reaction.users.remove(user);
                stopInteracting(user);
            },
        });

        let console = new Console({
            title: 'Role Selector!',
            description: 'React to the specified emoji to get the role, un-react to remove the role.',
            channel: message.channel,
        });
        console.addFeature(addTransferFeature);

        await console.sendConsole();
	}
}