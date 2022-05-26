import winston from "winston";
import type { GuildMember, RoleResolvable } from "discord.js";
import { discordLog } from "./discord-utils";


/**
 * Checks if the member has a role, returns true if it does
 * @param member - member to check role
 * @param role - role ID to check for
 */
 export function checkForRole(member: GuildMember, role: string) {
    winston.loggers.get(member.guild.id).verbose(`A role check was requested. Role ID: ${role}. Member ID: ${member.id}`);
    return member.roles.cache.has(role);
}

/**
 * Add a role to a member
 * @param member - the guild member to give a role to
 * @param addRole - the role to add to the member
 */
export function addRoleToMember(member: GuildMember, addRole: RoleResolvable) {    
    let role = member.guild.roles.resolve(addRole);

    if (!role) {
        winston.loggers.get(member.guild.id).error(
            `Could not give the member with id ${member.id} the role resolvable ${addRole}. A role was not found!`
        );
        return;
    }

    let memberPromise = member.roles.add(addRole).catch(error => {
        discordLog(member.guild, '@everyone The member <@' + member.id + '> did not get the role <@&' + role?.id +'> please help me!');
        winston.loggers.get(member.guild.id).error(
            `Could not give the member with id ${member.id} the role ${role?.name} with id ${role?.id}. The following error ocurred: ${error.name} - ${error.message}.`, 
            { event: 'Error', data: error }
        );
    });
    winston.loggers.get(member.guild.id).verbose(`A member with id ${member.id} was given the role ${role.name} with id ${role.id}`);
    return memberPromise;
}

/**
 * Remove a role to a member
 * @param member - the guild member to give a role to
 * @param removeRole - the role to add to the member
 */
export function removeRoleToMember(member: GuildMember, removeRole: RoleResolvable) {
    let role = member.guild.roles.resolve(removeRole);

    if (!role) {
        winston.loggers.get(member.guild.id).error(
            `Could not remove the member with id ${member.id} the role resolvable ${removeRole}. No Role was found!`
            );
        return;
    }

    let memberPromise = member.roles.remove(removeRole).catch(error => {
        discordLog(member.guild, '@everyone The member <@' + member.user.id + 
                '> did not loose the role ' + member.guild.roles.resolve(removeRole)?.id + ', please help me!'
            );
        winston.loggers.get(member.guild.id).error(
            `Could not remove the member with id ${member.id} the role ${role?.name} with id ${role?.id}. The following error ocurred: ${error.name} - ${error.message}.`
            );
    });
    winston.loggers.get(member.guild.id).verbose(`A member with id ${member.id} lost the role ${role.name} with id ${role.id}`);
    return memberPromise;
}

/**
 * Replaces one role for the other
 * @param member - member to change roles to
 * @param removeRole - role to remove
 * @param addRole - role to add
 */
export async function replaceRoleToMember(member: GuildMember, removeRole: RoleResolvable, addRole: RoleResolvable) {
    await addRoleToMember(member, addRole);
    await removeRoleToMember(member, removeRole);
}