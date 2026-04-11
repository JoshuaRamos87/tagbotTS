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
import { ChatInputCommandInteraction, Message, GuildMember, ActivityType, EmbedBuilder } from 'discord.js';
import { Readable } from 'node:stream';

let yt: Innertube;
let statusInterval: NodeJS.Timeout | null = null;

async function getYouTube() {
    if (!yt) {
        yt = await Innertube.create({
            generate_session_locally: true,
            location: 'US'
        });
    }
    return yt;
}

function formatTime(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function sendResponse(context: any, content: any) {
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

    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
    guild.client.user?.setActivity(null);

    const connection = getVoiceConnection(guild.id);
    if (connection) {
        connection.destroy();
        await sendResponse(context, "⏹️ Disconnected.");
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
        
        let info;
        try {
            info = await youtube.getBasicInfo(videoId);
        } catch (e) {
            const search = await youtube.search(input);
            const firstVideo = search.videos?.[0];
            if (!firstVideo || !('id' in firstVideo)) throw new Error("Video not found.");
            info = await youtube.getBasicInfo((firstVideo as any).id);
        }

        const title = info.basic_info.title || "YouTube Audio";
        const durationSeconds = info.basic_info.duration || 0;
        const thumbnail = info.basic_info.thumbnail?.[0]?.url;

        const ytDlpProcess = ytdl.exec(cleanUrl, {
            output: '-',
            format: 'bestaudio',
            quiet: true
        }, { stdio: ['ignore', 'pipe', 'ignore'] });

        if (!ytDlpProcess.stdout) throw new Error("Failed to initialize stream.");

        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: context.guild.id,
            adapterCreator: context.guild.voiceAdapterCreator,
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

        const player = createAudioPlayer();
        const resource = createAudioResource(ytDlpProcess.stdout as Readable, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        connection.subscribe(player);
        player.play(resource);

        // Create Initial Embed
        const createEmbed = (current: string, total: string) => {
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(title)
                .setURL(cleanUrl)
                .setAuthor({ name: 'Now Playing', iconURL: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png' })
                .setThumbnail(thumbnail || null)
                .setDescription(`▶️ **${current} / ${total}**`)
                .setTimestamp();
        };

        const totalTimeStr = formatTime(durationSeconds * 1000);
        const initialEmbed = createEmbed("0:00", totalTimeStr);
        
        // Use sendResponse and capture the message
        let response = await sendResponse(context, { embeds: [initialEmbed] });
        
        // Handle case where sendResponse returns an InteractionResponse or Message
        let message: Message | null = null;
        if (response instanceof Message) {
            message = response;
        } else if (context.fetchReply) {
            message = await context.fetchReply();
        }

        // Update Interval
        if (statusInterval) clearInterval(statusInterval);
        
        statusInterval = setInterval(async () => {
            if (player.state.status === AudioPlayerStatus.Playing) {
                const playedMs = resource.playbackDuration;
                const currentTimeStr = formatTime(playedMs);
                
                // Update Presence
                context.client.user?.setActivity(`${currentTimeStr} / ${totalTimeStr}`, { 
                    type: ActivityType.Listening 
                });

                // Update Embed
                if (message && message.editable) {
                    try {
                        await message.edit({ embeds: [createEmbed(currentTimeStr, totalTimeStr)] });
                    } catch (e) {
                        console.error("[Embed Update Error] Likely rate limited or deleted.");
                    }
                }
            }
        }, 5000); // 5 seconds to be safe with Discord rate limits for edits

        player.on(AudioPlayerStatus.Idle, () => {
            if (statusInterval) {
                clearInterval(statusInterval);
                statusInterval = null;
            }
            context.client.user?.setActivity(null);
            if (message && message.editable) {
                message.edit({ content: "Finished playing.", embeds: [] }).catch(() => {});
            }
        });

        player.on('error', error => {
            console.error(`[AudioPlayer Error] ${error.message}`);
            if (statusInterval) clearInterval(statusInterval);
        });

    } catch (error: any) {
        console.error("[Play Error]", error.message);
        await sendResponse(context, `❌ Play Error: ${error.message}`);
    }
}
