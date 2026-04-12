import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    StreamType,
    entersState,
    getVoiceConnection,
    AudioPlayer
} from '@discordjs/voice';
import { Innertube } from 'youtubei.js';
import ytdl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { ChatInputCommandInteraction, Message, GuildMember, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Readable } from 'node:stream';

let yt: Innertube;

// Guild-specific state management
interface GuildState {
    interval: NodeJS.Timeout | null;
    currentResource: any | null; // AudioResource
    currentUrl: string | null;
    startTimeSeconds: number;
    player: AudioPlayer;
    message: Message | null;
    collector: any | null;
}
const guildStates = new Map<string, GuildState>();

const BASED_ERRORS = [
    "Something went wrong, but we're still based.",
    "The code is tripping but the bot is still dripping.",
    "Error 404: Skill not found. Just kidding, the bot is fine.",
    "The bot took a hit, but it's built different. Still standing.",
    "A minor setback for a major comeback. Bot's still up.",
    "Logic failed, but the vibe remains untouched."
];

function getBasedError() {
    return BASED_ERRORS[Math.floor(Math.random() * BASED_ERRORS.length)];
}

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

    const state = guildStates.get(guild.id);
    if (state?.interval) {
        clearInterval(state.interval);
    }
    guildStates.delete(guild.id);

    guild.client.user?.setActivity(null);

    const connection = getVoiceConnection(guild.id);
    if (connection) {
        connection.destroy();
        await sendResponse(context, "⏹️ Disconnected.");
    } else {
        await sendResponse(context, "❌ Not in a voice channel.");
    }
}

export async function skipForward(context: any, seconds: number) {
    const guildId = context.guild?.id;
    if (!guildId) return;
    
    const state = guildStates.get(guildId);
    if (!state || !state.currentUrl) {
        return sendResponse(context, "❌ Nothing is currently playing.");
    }

    const playedMs = state.currentResource?.playbackDuration || 0;
    let newOffset = state.startTimeSeconds + Math.floor(playedMs / 1000) + seconds;

    if (newOffset < 0) newOffset = 0;

    const actionText = seconds > 0 ? `forward ${seconds}s` : `backward ${Math.abs(seconds)}s`;
    await sendResponse(context, `⏩ Skipping ${actionText} to ${formatTime(newOffset * 1000)}...`);
    return playYouTube(state.currentUrl, context, newOffset);
}

export async function playYouTube(url: string, context: any, skipSeconds: number = 0) {
    const input = url?.trim();
    if (!input || input === 'undefined') {
        return sendResponse(context, "❌ No URL provided!");
    }

    // Extract ID and check for URL timestamp (e.g., ?t=125 or &t=1m20s)
    const idMatch = input.match(/(?:v=|\/|watchv=|^)([a-zA-Z0-9_-]{11})(?:&|$|\?)/);
    const videoId = idMatch ? idMatch[1] : input;
    
    const tMatch = input.match(/[?&]t=([0-9hms]+)/);
    let urlTimestamp = 0;
    if (tMatch) {
        const t = tMatch[1];
        if (/^\d+$/.test(t)) {
            urlTimestamp = parseInt(t);
        } else {
            const h = t.match(/(\d+)h/);
            const m = t.match(/(\d+)m/);
            const s = t.match(/(\d+)s/);
            if (h) urlTimestamp += parseInt(h[1]) * 3600;
            if (m) urlTimestamp += parseInt(m[1]) * 60;
            if (s) urlTimestamp += parseInt(s[1]);
        }
    }

    // Prioritize manual skip parameter, fallback to URL timestamp
    const effectiveSkip = skipSeconds > 0 ? skipSeconds : urlTimestamp;
    
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const member = context.member as GuildMember;
    if (!member?.voice?.channel) {
        return sendResponse(context, "❌ You must be in a voice channel!");
    }

    const guildId = context.guild.id;

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

        // Apply skip if specified via downloader (Confirmed reliable method in GEMINI.md)
        // We use ffmpeg_i:-ss for FAST seeking (input seek) to avoid silence/timeouts
        const flags: any = {
            output: '-',
            format: 'bestaudio',
            quiet: true,
            ffmpegLocation: ffmpegPath
        };

        if (effectiveSkip > 0) {
            flags.downloader = 'ffmpeg';
            flags.downloaderArgs = `ffmpeg_i:-ss ${effectiveSkip}`;
        }

        // Use cleanUrl to avoid double-seeking if yt-dlp tries to honor the URL param
        const ytDlpProcess = (ytdl as any).exec(cleanUrl, flags, { stdio: ['ignore', 'pipe', 'ignore'] });

        if (!ytDlpProcess.stdout) throw new Error("Failed to initialize stream.");

        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: guildId,
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

        // Cleanup previous state for this guild
        const oldState = guildStates.get(guildId);
        if (oldState) {
            if (oldState.interval) clearInterval(oldState.interval);
            try { oldState.player?.stop(); } catch (e) {}
            try { oldState.collector?.stop(); } catch (e) {}
        }

        // Create Initial Embed and Buttons
        const createEmbed = (current: string, total: string, isPaused: boolean = false) => {
            const statusEmoji = isPaused ? "⏸️" : "▶️";
            const description = effectiveSkip > 0 
                ? `${statusEmoji} **${current} / ${total}** (Started at ${formatTime(effectiveSkip * 1000)})`
                : `${statusEmoji} **${current} / ${total}**`;

            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(title)
                .setURL(cleanUrl)
                .setAuthor({ name: 'Now Playing', iconURL: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png' })
                .setThumbnail(thumbnail || null)
                .setDescription(description)
                .setTimestamp();
        };

        const createButtons = (isPaused: boolean = false) => {
            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('back_30')
                    .setLabel('Back 30s')
                    .setEmoji('⏪')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('play_pause')
                    .setLabel(isPaused ? 'Resume' : 'Pause')
                    .setEmoji(isPaused ? '▶️' : '⏸️')
                    .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('stop_playback')
                    .setLabel('Stop')
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('forward_30')
                    .setLabel('Forward 30s')
                    .setEmoji('⏩')
                    .setStyle(ButtonStyle.Secondary)
            );
        };

        const totalTimeStr = formatTime(durationSeconds * 1000);
        const initialEmbed = createEmbed(formatTime(effectiveSkip * 1000), totalTimeStr);
        const initialButtons = createButtons(false);
        
        let response = await sendResponse(context, { embeds: [initialEmbed], components: [initialButtons] });
        
        let message: Message | null = null;
        if (response instanceof Message) {
            message = response;
        } else if (context.fetchReply) {
            message = await context.fetchReply();
        }

        // Button Interaction Collector
        let collector: any = null;
        if (message) {
            collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: (durationSeconds + 60) * 1000 // Last as long as the video + 1m buffer
            });

            collector.on('collect', async (interaction: any) => {
                const state = guildStates.get(guildId);
                if (!state) {
                    await interaction.reply({ content: "❌ No active playback state found.", ephemeral: true }).catch(() => {});
                    return;
                }

                if (interaction.customId === 'play_pause') {
                    if (player.state.status === AudioPlayerStatus.Playing) {
                        player.pause();
                        const pausedEmbed = createEmbed(formatTime(effectiveSkip * 1000 + resource.playbackDuration), totalTimeStr, true);
                        await interaction.update({ embeds: [pausedEmbed], components: [createButtons(true)] }).catch(() => {});
                    } else if (player.state.status === AudioPlayerStatus.Paused) {
                        player.unpause();
                        const playingEmbed = createEmbed(formatTime(effectiveSkip * 1000 + resource.playbackDuration), totalTimeStr, false);
                        await interaction.update({ embeds: [playingEmbed], components: [createButtons(false)] }).catch(() => {});
                    } else {
                        await interaction.reply({ content: "❌ Player is not in a pausable/resumable state.", ephemeral: true }).catch(() => {});
                    }
                } else if (interaction.customId === 'stop_playback') {
                    await interaction.deferUpdate().catch(() => {});
                    await stopPlayback(context);
                } else if (interaction.customId === 'back_30') {
                    await interaction.deferUpdate().catch(() => {});
                    await skipForward(context, -30);
                } else if (interaction.customId === 'forward_30') {
                    await interaction.deferUpdate().catch(() => {});
                    await skipForward(context, 30);
                }
            });
        }

        // Update Interval
        const interval = setInterval(async () => {
            const isPlaying = player.state.status === AudioPlayerStatus.Playing;
            const isPaused = player.state.status === AudioPlayerStatus.Paused;

            if (isPlaying || isPaused) {
                const playedMs = resource.playbackDuration;
                const currentTimeMs = (effectiveSkip * 1000) + playedMs;
                const currentTimeStr = formatTime(currentTimeMs);
                
                if (isPlaying) {
                    context.client.user?.setActivity(`${currentTimeStr} / ${totalTimeStr}`, { 
                        type: ActivityType.Listening 
                    });
                }

                if (message && message.editable) {
                    try {
                        await message.edit({ 
                            embeds: [createEmbed(currentTimeStr, totalTimeStr, isPaused)],
                            components: [createButtons(isPaused)]
                        });
                    } catch (e) {
                        console.error("[Embed Update Error] Likely rate limited or deleted.");
                    }
                }
            }
        }, 5000);

        guildStates.set(guildId, {
            interval: interval,
            currentResource: resource,
            currentUrl: cleanUrl,
            startTimeSeconds: effectiveSkip,
            player: player,
            message: message,
            collector: collector
        });

        player.on(AudioPlayerStatus.Idle, () => {
            const state = guildStates.get(guildId);
            if (state?.interval) {
                clearInterval(state.interval);
                guildStates.delete(guildId);
            }
            context.client.user?.setActivity(null);
            if (message && message.editable) {
                message.edit({ content: "Finished playing.", embeds: [], components: [] }).catch(() => {});
            }
        });

        player.on('error', error => {
            console.error(`[AudioPlayer Error] ${error.message}`);
            const state = guildStates.get(guildId);
            if (state?.interval) {
                clearInterval(state.interval);
                guildStates.delete(guildId);
            }
            if (message && message.editable) {
                message.edit({ 
                    content: `❌ **${getBasedError()}**\n*(Playback Error: ${error.message})*`, 
                    components: [] 
                }).catch(() => {});
            }
        });

    } catch (error: any) {
        console.error("[Play Error]", error.message);
        const state = guildStates.get(guildId);
        if (state?.interval) {
            clearInterval(state.interval);
            guildStates.delete(guildId);
        }
        await sendResponse(context, `❌ **${getBasedError()}**\n*(Technical Error: ${error.message})*`);
    }
}
