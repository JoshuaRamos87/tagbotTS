import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    StreamType,
    entersState,
    getVoiceConnection
} from '@discordjs/voice';
import { Innertube } from 'youtubei.js';
import ytdl from 'youtube-dl-exec';
import { ChatInputCommandInteraction, Message, GuildMember } from 'discord.js';
import { Readable } from 'node:stream';

let yt: Innertube;

async function getYouTube() {
    if (!yt) {
        console.log("[YouTube] Initializing Innertube for metadata...");
        yt = await Innertube.create({
            generate_session_locally: true,
            location: 'US'
        });
    }
    return yt;
}

async function sendResponse(context: any, content: string) {
    try {
        if (context.replied !== undefined) {
            if (context.deferred || context.replied) {
                return await context.editReply(content);
            }
            return await context.reply(content);
        }
        if (context.channel && typeof context.channel.send === 'function') {
            return await context.channel.send(content);
        }
    } catch (err: any) {
        if (err.code === 10062 && context.followUp) {
            try { return await context.followUp(content); } catch (e) {}
        }
        console.error("[Response Error]", err.message);
    }
}

export async function stopPlayback(context: any) {
    const guild = context.guild;
    if (!guild) return;

    const connection = getVoiceConnection(guild.id);
    if (connection) {
        connection.destroy();
        await sendResponse(context, "⏹️ Disconnected from voice.");
    } else {
        await sendResponse(context, "❌ Not in a voice channel.");
    }
}

export async function playYouTube(url: string, context: any) {
    const input = url?.trim();
    if (!input || input === 'undefined') {
        return sendResponse(context, "❌ No URL provided!");
    }

    const idMatch = input.match(/(?:v=|\/|watchv=|^)([a-zA-Z0-9_-]{11})(?:&|$|\?)/);
    const videoId = idMatch ? idMatch[1] : input;
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const member = context.member as GuildMember;
    if (!member?.voice?.channel) {
        return sendResponse(context, "❌ You must be in a voice channel!");
    }

    try {
        const youtube = await getYouTube();
        console.log(`[Play] Targeting Video: ${videoId}`);
        
        let info;
        try {
            info = await youtube.getBasicInfo(videoId);
        } catch (e) {
            console.log("[Play] Basic info fetch failed, attempting search...");
            const search = await youtube.search(input);
            const firstVideo = search.videos?.[0];
            if (!firstVideo || !('id' in firstVideo)) throw new Error("Video not found.");
            info = await youtube.getBasicInfo((firstVideo as any).id);
        }

        const title = info.basic_info.title || "YouTube Audio";
        console.log(`[Play] Found: "${title}"`);

        console.log(`[Play] Initializing yt-dlp binary stream for ultimate bypass...`);

        // Using yt-dlp binary directly to stream the audio
        // This completely bypasses the 403 Forbidden Node.js fetch blocks
        const ytDlpProcess = ytdl.exec(cleanUrl, {
            output: '-',
            format: 'bestaudio',
            quiet: true
        }, { stdio: ['ignore', 'pipe', 'ignore'] });

        if (!ytDlpProcess.stdout) {
            throw new Error("Failed to initialize yt-dlp audio stream.");
        }

        const nodeStream = ytDlpProcess.stdout as Readable;

        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: context.guild.id,
            adapterCreator: context.guild.voiceAdapterCreator,
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

        const player = createAudioPlayer();
        const resource = createAudioResource(nodeStream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        resource.volume?.setVolume(1.0);
        connection.subscribe(player);
        player.play(resource);

        player.on(AudioPlayerStatus.Playing, () => {
            console.log(`[Status] yt-dlp streaming to Discord: ${title}`);
        });

        player.on('error', error => {
            console.error(`[AudioPlayer Error] ${error.message}`);
        });

        ytDlpProcess.on('close', code => {
            if (code !== 0 && code !== null) {
                console.error(`[yt-dlp Error] Process exited with code ${code}`);
            }
        });

        await sendResponse(context, `🎶 Now playing: **${title}**\n${cleanUrl}`);

    } catch (error: any) {
        console.error("[Play Error]", error.message);
        await sendResponse(context, `❌ Play Error: ${error.message || "Failed to stream audio."}`);
    }
}


