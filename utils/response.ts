import { BotContext } from './types.js';
import { ChatInputCommandInteraction, Message, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';

export async function sendResponse(context: BotContext, content: string | { content?: string, embeds?: any[], components?: any[], files?: any[], ephemeral?: boolean }) {
    const payload = typeof content === 'string' ? { content } : content;

    if (context instanceof Message) {
        return context.reply(payload);
    }
    
    // All other BotContext types are Interactions which have deferred/replied/reply/followUp
    const interaction = context as any;
    if (interaction.deferred || interaction.replied) {
        return interaction.followUp(payload);
    }
    return interaction.reply(payload);
}
