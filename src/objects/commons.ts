import { PermissionOverwriteOptions, Snowflake } from "discord.js";

/**
 * An object with a role and its permissions.
 */
 export interface RolePermission {
    id: Snowflake;
    permissions: PermissionOverwriteOptions;
}