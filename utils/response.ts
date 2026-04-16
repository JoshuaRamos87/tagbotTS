/**
 * Unified Response Utility for tagbotTS.
 * 
 * This module provides a standardized way to respond to Discord events regardless of whether 
 * they originate from a legacy Message ($ prefix) or a modern Interaction (Slash Commands, Buttons).
 */

import { BotContext } from './types.js';
import { ChatInputCommandInteraction, Message, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';

/**
 * Standardizes sending a response back to the user.
 * Automatically handles the difference between Message.reply() and Interaction.reply().
 * 
 * Features:
 * - Handles deferred or already-replied interactions by using followUp.
 * - Supports sending plain strings, embeds, components (buttons/menus), and files.
 * - Compatible with ChatInputCommandInteraction, Message, ButtonInteraction, and StringSelectMenuInteraction.
 * 
 * @param context - The BotContext (Interaction or Message) to respond to.
 * @param content - A string message or a full payload object containing embeds/components/files.
 */
export async function sendResponse(context: BotContext, content: string | { content?: string, embeds?: any[], components?: any[], files?: any[], ephemeral?: boolean }) {
    const payload = typeof content === 'string' ? { content } : content;

    // Standard legacy message reply
    if (context instanceof Message) {
        return context.reply(payload);
    }
    
    // Interactions (Slash Commands, Buttons, etc.)
    // If the bot has already acknowledged the interaction (replied or deferred), 
    // we must use followUp/editReply to avoid "Interaction already acknowledged" errors.
    const interaction = context as any;
    if (interaction.deferred || interaction.replied) {
        return interaction.followUp(payload);
    }
    
    return interaction.reply(payload);
}

/**
 * Utility to safely extract the Discord User ID from any BotContext.
 * 
 * This abstracts the difference between:
 * - Message: context.author.id
 * - Interaction: context.user.id
 * 
 * @param context - The BotContext to extract the ID from.
 * @returns The Discord snowflake ID of the user.
 */
export function getUserId(context: BotContext): string {
    return (context instanceof Message) ? context.author.id : context.user.id;
}
