import { getVoiceConnection } from '@discordjs/voice';
import { 
    EMOJI_SKIP_FORWARD, 
    RESPONSE_DISCONNECTED, 
    RESPONSE_NOT_IN_VOICE, 
    RESPONSE_NOTHING_PLAYING 
} from '../../utils/constants/index.js';
import { sendResponse } from '../../utils/response.js';
import { playbackSessions } from './state.js';
import { formatTime } from './utils.js';
import { playYouTube } from './engine.js';

export async function stopPlayback(context: any) {
    const guild = context.guild;
    if (!guild) return;

    const state = playbackSessions.get(guild.id);
    if (state?.interval) {
        clearInterval(state.interval);
    }
    playbackSessions.delete(guild.id);

    guild.client.user?.setActivity(null);

    const connection = getVoiceConnection(guild.id);
    if (connection) {
        connection.destroy();
        await sendResponse(context, RESPONSE_DISCONNECTED);
    } else {
        await sendResponse(context, RESPONSE_NOT_IN_VOICE);
    }
}

export async function skipForward(context: any, seconds: number) {
    const guildId = context.guild?.id;
    if (!guildId) return;
    
    const state = playbackSessions.get(guildId);
    if (!state || !state.currentUrl) {
        return sendResponse(context, RESPONSE_NOTHING_PLAYING);
    }

    const playedMs = state.currentResource?.playbackDuration || 0;
    let newOffset = state.startTimeSeconds + Math.floor(playedMs / 1000) + seconds;

    if (newOffset < 0) newOffset = 0;

    const actionText = seconds > 0 ? `forward ${seconds}s` : `backward ${Math.abs(seconds)}s`;
    await sendResponse(context, `${EMOJI_SKIP_FORWARD} Skipping ${actionText} to ${formatTime(newOffset * 1000)}...`);
    return playYouTube(state.currentUrl, context, newOffset);
}

export async function seekTo(context: any, targetSeconds: number) {
    const guildId = context.guild?.id;
    if (!guildId) return;
    
    const state = playbackSessions.get(guildId);
    if (!state || !state.currentUrl) {
        return sendResponse(context, RESPONSE_NOTHING_PLAYING);
    }

    await sendResponse(context, `${EMOJI_SKIP_FORWARD} Seeking to ${formatTime(targetSeconds * 1000)}...`);
    return playYouTube(state.currentUrl, context, targetSeconds);
}
