import { ChatInputCommandInteraction, Message, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';

export type BotContext = ChatInputCommandInteraction | Message | ButtonInteraction | StringSelectMenuInteraction;
