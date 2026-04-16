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
import { ChatInputCommandInteraction, Message, GuildMember, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { Readable } from 'node:stream';

import { ERROR_GENERIC, LOG_PREFIX_CHAPTERS, LOG_PREFIX_AUDIOPLAYER_ERROR, LOG_PREFIX_PLAY_ERROR, EMOJI_ERROR, EMOJI_PLAY, EMOJI_PAUSE, EMOJI_STOP, EMOJI_SKIP_FORWARD, EMOJI_SKIP_BACKWARD, BUTTON_ID_PLAY_PAUSE, BUTTON_ID_STOP_PLAYBACK, BUTTON_ID_SKIP_BACK_30, BUTTON_ID_SKIP_FORWARD_30, BUTTON_ID_CHAPTER_SELECT, EMBED_TITLE_NOW_PLAYING, RESPONSE_DISCONNECTED, RESPONSE_NOT_IN_VOICE, RESPONSE_NOTHING_PLAYING, RESPONSE_NO_URL, RESPONSE_MUST_BE_IN_VOICE, RESPONSE_FINISHED_PLAYING } from '../utils/constants/index.js';
import { sendResponse, getUserId } from '../utils/response.js';
import { logError } from '../utils/database.js';

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
        await sendResponse(context, RESPONSE_DISCONNECTED);
    } else {
        await sendResponse(context, RESPONSE_NOT_IN_VOICE);
    }
}

export async function skipForward(context: any, seconds: number) {
    const guildId = context.guild?.id;
    if (!guildId) return;
    
    const state = guildStates.get(guildId);
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
    
    const state = guildStates.get(guildId);
    if (!state || !state.currentUrl) {
        return sendResponse(context, RESPONSE_NOTHING_PLAYING);
    }

    await sendResponse(context, `${EMOJI_SKIP_FORWARD} Seeking to ${formatTime(targetSeconds * 1000)}...`);
    return playYouTube(state.currentUrl, context, targetSeconds);
}

export async function playYouTube(url: string, context: any, skipSeconds: number = 0) {
    const input = url?.trim();
    if (!input || input === 'undefined') {
        return sendResponse(context, RESPONSE_NO_URL);
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
        return sendResponse(context, RESPONSE_MUST_BE_IN_VOICE);
    }

    const guildId = context.guild.id;

    try {
        const youtube = await getYouTube();
        
        let info;
        try {
            info = await youtube.getInfo(videoId);
        } catch (e) {
            const search = await youtube.search(input);
            const firstVideo = search.videos?.[0];
            if (!firstVideo || !('id' in firstVideo)) throw new Error("Video not found.");
            info = await youtube.getInfo((firstVideo as any).id);
        }

        const title = info.basic_info.title || "YouTube Audio";
        const durationSeconds = info.basic_info.duration || 0;
        const thumbnail = info.basic_info.thumbnail?.[0]?.url;

        // Extract Chapters (Ultimate Deep Search Strategy)
        const chapters: { title: string, time_seconds: number }[] = [];
        
        const addChapter = (titleStr: string, startMs: number) => {
            const sec = Math.floor(startMs / 1000);
            if (titleStr && chapters.every(c => c.time_seconds !== sec)) {
                chapters.push({ title: titleStr.slice(0, 100), time_seconds: sec });
            }
        };

        try {
            const seen = new Set();
            const deepSearchChapters = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                if (seen.has(obj)) return;
                seen.add(obj);

                const titleVal = obj.title?.simpleText || obj.title?.text || obj.title?.runs?.[0]?.text || (typeof obj.title === 'string' ? obj.title : null);
                const timeMs = obj.timeRangeStartMillis !== undefined ? obj.timeRangeStartMillis : (obj.start_time_ms !== undefined ? obj.start_time_ms : obj.startTimeMs);

                // Detect chapter markers from raw or parsed properties
                if (titleVal && timeMs !== undefined && !isNaN(Number(timeMs))) {
                    const isChapterType = obj.type === 'MacroMarkersListItem' || obj.type === 'Chapter' || obj.type === 'Marker';
                    const hasUniqueChapterKeys = obj.timeRangeStartMillis !== undefined || obj.timeDescription !== undefined || obj.start_time_ms !== undefined;
                    
                    if (isChapterType || hasUniqueChapterKeys) {
                        addChapter(titleVal, Number(timeMs));
                    }
                }

                // Recursively search children
                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        // Skip massive unhelpful objects to prevent stack overflow
                        if (key === 'client' || key === 'env' || key === 'session') continue;
                        deepSearchChapters(obj[key]);
                    }
                }
            };
            deepSearchChapters(info);
        } catch (e: any) {
            console.error(LOG_PREFIX_CHAPTERS, e.message);
        }

        // Description Parser Fallback (If official metadata is missing)
        if (chapters.length === 0) {
            try {
                let description = "";
                const basicInfo = info.basic_info as any;
                if (basicInfo?.short_description) description = basicInfo.short_description.toString();
                if (!description && basicInfo?.description) description = basicInfo.description.toString();
                
                // If standard access fails or returns an object representation, do a deep text scrape of basic_info
                if (!description || description.includes("[object Object]")) {
                    description = "";
                    const seenDesc = new Set();
                    const findText = (obj: any) => {
                        if (!obj || typeof obj !== 'object') return;
                        if (seenDesc.has(obj)) return;
                        seenDesc.add(obj);
                        if (typeof obj.text === 'string' && obj.text.length > 20) description += obj.text + "\n";
                        if (typeof obj.simpleText === 'string' && obj.simpleText.length > 20) description += obj.simpleText + "\n";
                        for (const key in obj) {
                            if (Object.prototype.hasOwnProperty.call(obj, key)) findText(obj[key]);
                        }
                    };
                    findText(basicInfo);
                }

                const lines = description.split('\n');
                const timestampRegex = /([\[\(])?(\d{1,2}:)?(\d{1,2}:\d{2})([\]\)])?/;
                
                lines.forEach(line => {
                    const match = line.match(timestampRegex);
                    if (match) {
                        const fullTimestamp = match[0];
                        const cleanTimestamp = match[2] ? match[2] + match[3] : match[3];
                        
                        const parts = cleanTimestamp.split(':').reverse();
                        let sec = 0;
                        if (parts[0]) sec += parseInt(parts[0]);
                        if (parts[1]) sec += parseInt(parts[1]) * 60;
                        if (parts[2]) sec += parseInt(parts[2]) * 3600;
                        
                        let chapterTitle = line.replace(fullTimestamp, '').trim();
                        chapterTitle = chapterTitle.replace(/^[:\-\s\d.]+/, '').trim(); 
                        chapterTitle = chapterTitle.replace(/[:\-\s]+$/, '').trim();
                        
                        if (chapterTitle) addChapter(chapterTitle, sec * 1000);
                    }
                });
            } catch (descErr: any) {
                console.error("[Description Parse Error]", descErr.message);
            }
        }

        // Final sort and validation
        chapters.sort((a, b) => a.time_seconds - b.time_seconds);
        if (chapters.length > 0) {
            console.log(`${LOG_PREFIX_CHAPTERS} Successfully extracted ${chapters.length} chapters for "${title}"`);
        }

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
            const statusEmoji = isPaused ? EMOJI_PAUSE : EMOJI_PLAY;
            const description = effectiveSkip > 0 
                ? `${statusEmoji} **${current} / ${total}** (Started at ${formatTime(effectiveSkip * 1000)})`
                : `${statusEmoji} **${current} / ${total}**`;

            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(title)
                .setURL(cleanUrl)
                .setAuthor({ name: EMBED_TITLE_NOW_PLAYING, iconURL: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png' })
                .setThumbnail(thumbnail || null)
                .setDescription(description)
                .setTimestamp();
        };

        const createButtons = (isPaused: boolean = false) => {
            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(BUTTON_ID_SKIP_BACK_30)
                    .setLabel('Back 30s')
                    .setEmoji(EMOJI_SKIP_BACKWARD)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(BUTTON_ID_PLAY_PAUSE)
                    .setLabel(isPaused ? 'Resume' : 'Pause')
                    .setEmoji(isPaused ? EMOJI_PLAY : EMOJI_PAUSE)
                    .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(BUTTON_ID_STOP_PLAYBACK)
                    .setLabel('Stop')
                    .setEmoji(EMOJI_STOP)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(BUTTON_ID_SKIP_FORWARD_30)
                    .setLabel('Forward 30s')
                    .setEmoji(EMOJI_SKIP_FORWARD)
                    .setStyle(ButtonStyle.Secondary)
            );
        };

        const createChapterMenu = () => {
            if (chapters.length === 0) return null;
            
            const menu = new StringSelectMenuBuilder()
                .setCustomId(BUTTON_ID_CHAPTER_SELECT)
                .setPlaceholder('Jump to Chapter...')
                .addOptions(
                    chapters.slice(0, 25).map(c => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(c.title.slice(0, 100))
                            .setDescription(formatTime(c.time_seconds * 1000))
                            .setValue(c.time_seconds.toString())
                    )
                );

            return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
        };

        const totalTimeStr = formatTime(durationSeconds * 1000);
        const initialEmbed = createEmbed(formatTime(effectiveSkip * 1000), totalTimeStr);
        const initialButtons = createButtons(false);
        const chapterMenu = createChapterMenu();
        
        const components: any[] = [initialButtons];
        if (chapterMenu) components.push(chapterMenu);

        let response = await sendResponse(context, { embeds: [initialEmbed], components });
        
        let message: Message | null = null;
        if (response instanceof Message) {
            message = response;
        } else if (context.fetchReply) {
            message = await context.fetchReply();
        }

        // Interaction Collector
        let collector: any = null;
        if (message) {
            collector = message.createMessageComponentCollector({
                time: (durationSeconds + 60) * 1000 // Last as long as the video + 1m buffer
            });

            collector.on('collect', async (interaction: any) => {
                const state = guildStates.get(guildId);
                if (!state) {
                    await interaction.reply({ content: `${EMOJI_ERROR} No active playback state found.`, ephemeral: true }).catch(() => {});
                    return;
                }

                if (interaction.isButton()) {
                    if (interaction.customId === BUTTON_ID_PLAY_PAUSE) {
                        if (player.state.status === AudioPlayerStatus.Playing) {
                            player.pause();
                            const pausedEmbed = createEmbed(formatTime(effectiveSkip * 1000 + resource.playbackDuration), totalTimeStr, true);
                            await interaction.update({ embeds: [pausedEmbed], components }).catch(() => {});
                        } else if (player.state.status === AudioPlayerStatus.Paused) {
                            player.unpause();
                            const playingEmbed = createEmbed(formatTime(effectiveSkip * 1000 + resource.playbackDuration), totalTimeStr, false);
                            await interaction.update({ embeds: [playingEmbed], components }).catch(() => {});
                        } else {
                            await interaction.reply({ content: `${EMOJI_ERROR} Player is not in a pausable/resumable state.`, ephemeral: true }).catch(() => {});
                        }
                    } else if (interaction.customId === BUTTON_ID_STOP_PLAYBACK) {
                        await interaction.deferUpdate().catch(() => {});
                        await stopPlayback(context);
                    } else if (interaction.customId === BUTTON_ID_SKIP_BACK_30) {
                        await interaction.deferUpdate().catch(() => {});
                        await skipForward(context, -30);
                    } else if (interaction.customId === BUTTON_ID_SKIP_FORWARD_30) {
                        await interaction.deferUpdate().catch(() => {});
                        await skipForward(context, 30);
                    }
                } else if (interaction.isStringSelectMenu()) {
                    if (interaction.customId === BUTTON_ID_CHAPTER_SELECT) {
                        await interaction.deferUpdate().catch(() => {});
                        const targetSeconds = parseInt(interaction.values[0]);
                        await seekTo(context, targetSeconds);
                    }
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
                        const currentComponents: any[] = [createButtons(isPaused)];
                        if (chapterMenu) currentComponents.push(chapterMenu);

                        await message.edit({ 
                            embeds: [createEmbed(currentTimeStr, totalTimeStr, isPaused)],
                            components: currentComponents
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
                message.edit({ content: RESPONSE_FINISHED_PLAYING, embeds: [], components: [] }).catch(() => {});
            }
        });

        player.on('error', error => {
            console.error(`${LOG_PREFIX_AUDIOPLAYER_ERROR} ${error.message}`);
            
            // Log exception to DB
            logError(error, {
                method: 'AudioPlayer:error',
                guild_id: guildId,
                additional_info: { url: cleanUrl }
            });

            const state = guildStates.get(guildId);
            if (state?.interval) {
                clearInterval(state.interval);
                guildStates.delete(guildId);
            }
            if (message && message.editable) {
                message.edit({ 
                    content: `${EMOJI_ERROR} **${ERROR_GENERIC}**\n*(Playback Error: ${error.message})*`, 
                    components: [] 
                }).catch(() => {});
            }
        });

    } catch (error: any) {
        console.error(LOG_PREFIX_PLAY_ERROR, error.message);
        
        // Log exception to DB
        logError(error, {
            method: 'playYouTube:fatal',
            user_id: getUserId(context),
            guild_id: context.guild?.id,
            channel_id: context.channel?.id,
            additional_info: { url: url }
        });

        const state = guildStates.get(guildId);
        if (state?.interval) {
            clearInterval(state.interval);
            guildStates.delete(guildId);
        }
        await sendResponse(context, `${EMOJI_ERROR} **${ERROR_GENERIC}**\n*(Technical Error: ${error.message})*`);
    }
}
