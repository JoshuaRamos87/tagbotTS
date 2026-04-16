import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { findac, handleAutocomplete } from '../actions/findac.js';

const builder = new SlashCommandBuilder()
    .setName('findac')
    .setDescription('Find an anime character image from Gelbooru using up to 10 tags.')
    .addStringOption(option =>
        option.setName('tag1')
            .setDescription('Primary tag (required)')
            .setRequired(true)
            .setAutocomplete(true)
    );

// Add 9 more optional tags
for (let i = 2; i <= 10; i++) {
    builder.addStringOption(option =>
        option.setName(`tag${i}`)
            .setDescription(`Additional tag ${i} (optional)`)
            .setRequired(false)
            .setAutocomplete(true)
    );
}

export const data = builder;

export async function execute(interaction: ChatInputCommandInteraction) {
    await findac(interaction);
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    await handleAutocomplete(interaction);
}
