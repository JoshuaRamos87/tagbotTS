import { createAudioPlayer } from '@discordjs/voice';
import { playbackSessions, getYouTube } from './state.js';
import { playYouTube } from './engine.js';

/**
 * Returns the current queue for a guild, joined by newlines.
 */
export function getQueue(guildId: string): string {
    const state = playbackSessions.get(guildId);
    if (!state || state.queue.length === 0) return "";
    return state.queue.join('\n');
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
 * Updates the queue for a guild and starts playback if idle.
 */
export async function updateQueue(guildId: string, urls: string[], context: any): Promise<boolean> {
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
        state.queue = urls;
    }

    if (!state.currentUrl && state.queue.length > 0) {
        await playYouTube(state.queue[0], context, 0, true);
        return true;
    }
    return false;
}
