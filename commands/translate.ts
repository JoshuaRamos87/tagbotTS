import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import translate from '../actions/translate.js';

export const data = new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translates text to a specified language')
    .addStringOption(option => 
        option.setName('language')
            .setDescription('The target language (e.g., "en", "es", "japanese")')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('text')
            .setDescription('The text to translate')
            .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const lang = interaction.options.getString('language', true);
    const text = interaction.options.getString('text', true);
    await interaction.deferReply();
    translate(interaction, lang, text);
}
