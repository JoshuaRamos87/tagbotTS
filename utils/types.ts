import { 
    ChatInputCommandInteraction, 
    Message, 
    ButtonInteraction, 
    StringSelectMenuInteraction, 
    SlashCommandBuilder, 
    AutocompleteInteraction,
    Collection
} from 'discord.js';

export type BotContext = ChatInputCommandInteraction | Message | ButtonInteraction | StringSelectMenuInteraction;

export interface SlashCommand {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, SlashCommand>;
    }
}
