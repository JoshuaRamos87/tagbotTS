import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { gac, handleAutocomplete } from '../actions/gac.js';

const builder = new SlashCommandBuilder()
    .setName('gac')
    .setDescription('Find an anime character image from Gelbooru (GAC) using up to 10 tags.')
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
    await gac(interaction);
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    await handleAutocomplete(interaction);
}
