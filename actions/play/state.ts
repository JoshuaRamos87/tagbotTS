import { Innertube } from 'youtubei.js';
import { AudioPlayer } from '@discordjs/voice';
import { Message } from 'discord.js';

let yt: Innertube;

export interface PlaybackSession {
    interval: NodeJS.Timeout | null;
    currentResource: any | null; // AudioResource
    currentUrl: string | null;
    startTimeSeconds: number;
    player: AudioPlayer;
    message: Message | null;
    collector: any | null;
    queue: string[];
}

export const playbackSessions = new Map<string, PlaybackSession>();

export async function getYouTube() {
    if (!yt) {
        yt = await Innertube.create({
            generate_session_locally: true,
            location: 'US'
        });
    }
    return yt;
}
