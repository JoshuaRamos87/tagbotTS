import { createAudioPlayer } from '@discordjs/voice';
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder 
} from 'discord.js';
import { playbackSessions, getYouTube } from './state.js';
import { playYouTube } from './engine.js';
import { BUTTON_ID_ADD_TRACKS, SELECT_ID_REMOVE_TRACK } from '../../utils/constants/index.js';

/**
 * Returns the current queue for a guild, joined by newlines.
 */
export function getQueue(guildId: string): string {
    const state = playbackSessions.get(guildId);
    if (!state || state.queue.length === 0) return "";
    return state.queue.join('\n');
}

/**
 * Removes a track from the queue by index.
 */
export function removeFromQueue(guildId: string, index: number) {
    const state = playbackSessions.get(guildId);
    if (state && state.queue.length > index) {
        state.queue.splice(index, 1);
    }
}

/**
 * Fetches titles for a list of YouTube URLs in parallel.
 */
export async function getTitles(urls: string[]): Promise<{ title: string, url: string }[]> {
    const youtube = await getYouTube();
    const limit = urls.slice(0, 10);
    
    return Promise.all(limit.map(async (url) => {
        try {
            const idMatch = url.match(/(?:v=|\/|watchv=|^)([a-zA-Z0-9_-]{11})(?:&|$|\?)/);
            const videoId = idMatch ? idMatch[1] : url;
            const info = await youtube.getBasicInfo(videoId);
            return { 
                title: info.basic_info.title || "Unknown Title", 
                url: `https://www.youtube.com/watch?v=${videoId}` 
            };
        } catch {
            return { title: "Invalid or Private Video", url };
        }
    }));
}

/**
 * Builds the interactive Queue Dashboard.
 */
export async function buildQueueDashboard(guildId: string) {
    const state = playbackSessions.get(guildId);
    const queue = state?.queue || [];
    
    // Fetch titles for the first 10 tracks
    const metadata = await getTitles(queue);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎵 Music Queue Dashboard')
        .setDescription(
            metadata.length > 0 
                ? metadata.map((m, i) => `**${i + 1}.** [${m.title}](${m.url})`).join('\n')
                : 'The queue is currently empty.'
        )
        .setFooter({ text: `Total Tracks: ${queue.length}` });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(BUTTON_ID_ADD_TRACKS)
            .setLabel('Add Track(s)')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Primary)
    );

    const components: any[] = [buttons];

    // Only add removal dropdown if there are tracks
    if (metadata.length > 0) {
        const select = new StringSelectMenuBuilder()
            .setCustomId(SELECT_ID_REMOVE_TRACK)
            .setPlaceholder('Select a track to remove...')
            .addOptions(
                metadata.map((m, i) => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${i + 1}. ${m.title}`.slice(0, 100))
                        .setValue(i.toString())
                )
            );
        
        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
    }

    return { embeds: [embed], components };
}

/**
 * Updates the queue for a guild and starts playback if idle.
 */
export async function updateQueue(guildId: string, urls: string[], context: any, append: boolean = false): Promise<boolean> {
    let state = playbackSessions.get(guildId);
    if (!state) {
        state = {
            interval: null,
            currentResource: null,
            currentUrl: null,
            startTimeSeconds: 0,
            player: createAudioPlayer(),
            message: null,
            collector: null,
            queue: urls
        };
        playbackSessions.set(guildId, state);
    } else {
        if (append) {
            state.queue.push(...urls);
        } else {
            state.queue = urls;
        }
    }

    if (!state.currentUrl && state.queue.length > 0) {
        await playYouTube(state.queue[0], context, 0, true);
        return true;
    }
    return false;
}
