import winston from 'winston';
import { Collection, GuildMember, MessageEmbed } from 'discord.js';
import { sendMessageToMember } from '../../../lib/discord-utils/discord-utils';
import { addRoleToMember, replaceRoleToMember } from '../../../lib/discord-utils/role-utils';
import type { Activity } from '../../../objects/activities/activity';
import type { BotGuild } from '../../../objects/bot-guild';

export class StampManager {

    /**
     * Will let hackers get a stamp for attending the activity.
     * @param activity - activity to use
     * @param time - time to wait till collector closes, in seconds
     * @param botGuild
     * @async
     */
     static async distributeStamp(activity: Activity, botGuild: BotGuild, time: number = 60) {

        // winston.loggers.get(activity.guild.id).event(`Activity named ${activity.name} is distributing stamps.`, {event: 'Activity Manager'});
        
        // The users already seen by this stamp distribution.
        let seenUsers = new Collection();

        const promptEmbed = new MessageEmbed()
            .setColor(botGuild.colors.embedColor)
            .setTitle('React within ' + time + ' seconds of the posting of this message to get a stamp for ' + activity.name + '!');

        let promptMsg = await activity.room.generalText.send({embeds: [promptEmbed]});
        promptMsg.react('👍');

        // reaction collector, time is needed in milliseconds, we have it in seconds
        const collector = promptMsg.createReactionCollector({ time: (1000 * time), filter: (_reaction, user) => !user.bot });

        collector.on('collect', async (_reaction, user) => {
            // grab the member object of the reacted user
            const member = activity.guild.members.resolve(user);

            if (!seenUsers.has(user.id) && member) {
                this.parseRole(member, activity.name, botGuild);
                seenUsers.set(user.id, user.username);
            }
        });

        // edit the message to closed when the collector ends
        collector.on('end', _collected => {
            // winston.loggers.get(activity.guild.id).event(`Activity named ${activity.name} stamp distribution has stopped.`, {event: 'Activity Manager'});
            if (promptMsg.deletable) {
                promptMsg.edit({embeds: [promptEmbed.setTitle('Time\'s up! No more responses are being collected. Thanks for participating in ' + activity.name + '!')]});
            }
        });
    }


    /**
     * Upgrade the stamp role of a member.
     * @param {GuildMember} member - the member to add the new role to
     * @param {String} activityName - the name of the activity
     * @param botGuild
     * @throws Error if the botGuild has stamps disabled
     */
    static parseRole(member: GuildMember, activityName: string, botGuild: BotGuild) {
        if (!botGuild.stamps.isEnabled) {
            winston.loggers.get(botGuild._id).error(`Stamp system is turned off for guild ${botGuild._id} but I was asked to parse a role for member ${member.id} for activity ${activityName}.`, { event: 'Activity Manager' });
            throw Error(`Stamp system is turned of for guild ${botGuild._id} but I was asked to parse a role for member ${member.id} for activity ${activityName}.`);
        }

        let role = member.roles.cache.find(role => botGuild.stamps.stampRoleIDs.has(role.id));

        if (role === undefined) {
            addRoleToMember(member, botGuild.stamps.stamp0thRoleId!);
            sendMessageToMember(member, 'I did not find an existing stamp role for you so I gave you one for attending '
                + activityName + '. Please contact an admin if there was a problem.', true);
            // winston.loggers.get(botGuild._id).userStats(`Activity named ${activityName} tried to give a stamp to the user with id ${member.id} but he has no stamp, I gave them the first stamp!`, {event: 'Activity Manager'});
            return;
        }

        let stampNumber = botGuild.stamps.stampRoleIDs.get(role.id);
        if (stampNumber && stampNumber === botGuild.stamps.stampRoleIDs.size - 1) {
            sendMessageToMember(member, 'You already have the maximum allowed number of stamps!', true);
            // winston.loggers.get(botGuild._id).userStats(`Activity named ${activityName} tried to give a stamp to the user with id ${member.id} but he is already in the max stamp ${stampNumber}`, {event: 'Activity Manager'});
            return;
        } else if (stampNumber) {
            let newRoleID;

            botGuild.stamps.stampRoleIDs.forEach((num, key, _map) => {
                if (num === stampNumber! + 1) newRoleID = key;
            });

            if (newRoleID != undefined) {
                replaceRoleToMember(member, role.id, newRoleID);
                sendMessageToMember(member, 'You have received a higher stamp for attending ' + activityName + '!', true);
                // winston.loggers.get(botGuild._id).userStats(`Activity named ${activityName} gave a stamp to the user with id ${member.id} going from stamp number ${stampNumber} to ${stampNumber + 1}`, {event: 'Activity Manager'});
            }
        }
        
    }

}
