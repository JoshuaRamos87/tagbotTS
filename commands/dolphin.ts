import { SlashCommandBuilder } from 'discord.js';
import * as dolphin from '../actions/dolphin.js';

export const data = new SlashCommandBuilder()
    .setName('dolphin')
    .setDescription('Ask Dolphin (Ollama) a question')
    .addStringOption(option => 
        option.setName('prompt')
            .setDescription('The question you want to ask')
            .setRequired(true));

export async function execute(interaction) {
    const prompt = interaction.options.getString('prompt');
    await interaction.deferReply();
    dolphin.askDolphin(interaction, prompt);
}
