import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    StreamType,
    entersState
} from '@discordjs/voice';
import ytdl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { GuildMember, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Message } from 'discord.js';
import { Readable } from 'node:stream';

import { 
    ERROR_GENERIC, 
    LOG_PREFIX_CHAPTERS, 
    LOG_PREFIX_AUDIOPLAYER_ERROR, 
    LOG_PREFIX_PLAY_ERROR, 
    EMOJI_ERROR, 
    EMOJI_PLAY, 
    EMOJI_PAUSE, 
    EMOJI_STOP, 
    EMOJI_SKIP_FORWARD, 
    EMOJI_SKIP_BACKWARD, 
    BUTTON_ID_PLAY_PAUSE, 
    BUTTON_ID_STOP_PLAYBACK, 
    BUTTON_ID_SKIP_BACK_30, 
    BUTTON_ID_SKIP_FORWARD_30, 
    BUTTON_ID_CHAPTER_SELECT, 
    EMBED_TITLE_NOW_PLAYING, 
    RESPONSE_NO_URL, 
    RESPONSE_MUST_BE_IN_VOICE, 
    RESPONSE_FINISHED_PLAYING, 
    RESPONSE_ADDED_TO_QUEUE 
} from '../../utils/constants/index.js';
import { sendResponse, getUserId } from '../../utils/response.js';
import { logError } from '../../utils/database.js';
import { playbackSessions, getYouTube } from './state.js';
import { formatTime } from './utils.js';
import { stopPlayback, skipForward, seekTo } from './controls.js';

export async function playYouTube(url: string, context: any, skipSeconds: number = 0, isInternal: boolean = false) {
    const input = url?.trim();
    if (!input || input === 'undefined') {
        return sendResponse(context, RESPONSE_NO_URL);
    }

    const member = context.member as GuildMember;
    if (!member?.voice?.channel) {
        return sendResponse(context, RESPONSE_MUST_BE_IN_VOICE);
    }

    const guildId = context.guild.id;
    let state = playbackSessions.get(guildId);

    // Queue Logic
    if (!isInternal) {
        if (!state) {
            state = {
                interval: null,
                currentResource: null,
                currentUrl: null,
                startTimeSeconds: 0,
                player: createAudioPlayer(),
                message: null,
                collector: null,
                queue: [input]
            };
            playbackSessions.set(guildId, state);
        } else {
            state.queue.push(input);
            if (state.currentUrl) {
                return sendResponse(context, RESPONSE_ADDED_TO_QUEUE("New Track"));
            }
        }
    }

    const targetUrl = (state && state.queue.length > 0) ? state.queue[0] : input;
    const idMatch = targetUrl.match(/(?:v=|\/|watchv=|^)([a-zA-Z0-9_-]{11})(?:&|$|\?)/);
    const videoId = idMatch ? idMatch[1] : targetUrl;
    
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

    const effectiveSkip = skipSeconds > 0 ? skipSeconds : urlTimestamp;
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

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
                if (titleVal && timeMs !== undefined && !isNaN(Number(timeMs))) {
                    if (obj.type === 'MacroMarkersListItem' || obj.type === 'Chapter' || obj.type === 'Marker' || obj.timeRangeStartMillis !== undefined) {
                        addChapter(titleVal, Number(timeMs));
                    }
                }
                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        if (key === 'client' || key === 'env' || key === 'session') continue;
                        deepSearchChapters(obj[key]);
                    }
                }
            };
            deepSearchChapters(info);
        } catch (e: any) {
            console.error(LOG_PREFIX_CHAPTERS, e.message);
        }

        if (chapters.length === 0) {
            try {
                let description = "";
                const basicInfo = info.basic_info as any;
                if (basicInfo?.short_description) description = basicInfo.short_description.toString();
                if (!description && basicInfo?.description) description = basicInfo.description.toString();
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
                        chapterTitle = chapterTitle.replace(/^[:\-\s\d.]+/, '').trim().replace(/[:\-\s]+$/, '').trim();
                        if (chapterTitle) addChapter(chapterTitle, sec * 1000);
                    }
                });
            } catch (descErr: any) {}
        }

        chapters.sort((a, b) => a.time_seconds - b.time_seconds);

        const flags: any = { output: '-', format: 'bestaudio', quiet: true, ffmpegLocation: ffmpegPath };
        if (effectiveSkip > 0) {
            flags.downloader = 'ffmpeg';
            flags.downloaderArgs = `ffmpeg_i:-ss ${effectiveSkip}`;
        }

        const ytDlpProcess = (ytdl as any).exec(cleanUrl, flags, { stdio: ['ignore', 'pipe', 'ignore'] });
        if (!ytDlpProcess.stdout) throw new Error("Failed to initialize stream.");

        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: guildId,
            adapterCreator: context.guild.voiceAdapterCreator,
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

        const player = createAudioPlayer();
        const resource = createAudioResource(ytDlpProcess.stdout as Readable, { inputType: StreamType.Arbitrary, inlineVolume: true });

        connection.subscribe(player);
        player.play(resource);

        const oldState = playbackSessions.get(guildId);
        if (oldState) {
            if (oldState.interval) clearInterval(oldState.interval);
            try { oldState.player?.stop(); } catch (e) {}
            try { oldState.collector?.stop(); } catch (e) {}
        }

        const createEmbed = (current: string, total: string, isPaused: boolean = false) => {
            const statusEmoji = isPaused ? EMOJI_PAUSE : EMOJI_PLAY;
            return new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(title)
                .setURL(cleanUrl)
                .setAuthor({ name: EMBED_TITLE_NOW_PLAYING, iconURL: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png' })
                .setThumbnail(thumbnail || null)
                .setDescription(effectiveSkip > 0 ? `${statusEmoji} **${current} / ${total}** (Started at ${formatTime(effectiveSkip * 1000)})` : `${statusEmoji} **${current} / ${total}**`)
                .setTimestamp();
        };

        const createButtons = (isPaused: boolean = false) => {
            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(BUTTON_ID_SKIP_BACK_30).setLabel('Back 30s').setEmoji(EMOJI_SKIP_BACKWARD).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(BUTTON_ID_PLAY_PAUSE).setLabel(isPaused ? 'Resume' : 'Pause').setEmoji(isPaused ? EMOJI_PLAY : EMOJI_PAUSE).setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(BUTTON_ID_STOP_PLAYBACK).setLabel('Stop').setEmoji(EMOJI_STOP).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(BUTTON_ID_SKIP_FORWARD_30).setLabel('Forward 30s').setEmoji(EMOJI_SKIP_FORWARD).setStyle(ButtonStyle.Secondary)
            );
        };

        const createChapterMenu = () => {
            if (chapters.length === 0) return null;
            return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(BUTTON_ID_CHAPTER_SELECT)
                    .setPlaceholder('Jump to Chapter...')
                    .addOptions(chapters.slice(0, 25).map(c => new StringSelectMenuOptionBuilder().setLabel(c.title.slice(0, 100)).setDescription(formatTime(c.time_seconds * 1000)).setValue(c.time_seconds.toString())))
            );
        };

        const totalTimeStr = formatTime(durationSeconds * 1000);
        const chapterMenu = createChapterMenu();
        const components: any[] = [createButtons(false)];
        if (chapterMenu) components.push(chapterMenu);

        let response = await sendResponse(context, { embeds: [createEmbed(formatTime(effectiveSkip * 1000), totalTimeStr)], components });
        let message: Message | null = response instanceof Message ? response : (context.fetchReply ? await context.fetchReply() : null);

        let collector: any = null;
        if (message) {
            collector = message.createMessageComponentCollector({ time: (durationSeconds + 60) * 1000 });
            collector.on('collect', async (interaction: any) => {
                const s = playbackSessions.get(guildId);
                if (!s) return interaction.reply({ content: `${EMOJI_ERROR} No active playback state found.`, ephemeral: true }).catch(() => {});
                if (interaction.isButton()) {
                    if (interaction.customId === BUTTON_ID_PLAY_PAUSE) {
                        if (player.state.status === AudioPlayerStatus.Playing) {
                            player.pause();
                            await interaction.update({ embeds: [createEmbed(formatTime(effectiveSkip * 1000 + resource.playbackDuration), totalTimeStr, true)], components }).catch(() => {});
                        } else if (player.state.status === AudioPlayerStatus.Paused) {
                            player.unpause();
                            await interaction.update({ embeds: [createEmbed(formatTime(effectiveSkip * 1000 + resource.playbackDuration), totalTimeStr, false)], components }).catch(() => {});
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
                } else if (interaction.isStringSelectMenu() && interaction.customId === BUTTON_ID_CHAPTER_SELECT) {
                    await interaction.deferUpdate().catch(() => {});
                    await seekTo(context, parseInt(interaction.values[0]));
                }
            });
        }

        const interval = setInterval(async () => {
            const isPlaying = player.state.status === AudioPlayerStatus.Playing;
            const isPaused = player.state.status === AudioPlayerStatus.Paused;
            if (isPlaying || isPaused) {
                const currentTimeStr = formatTime((effectiveSkip * 1000) + resource.playbackDuration);
                if (isPlaying) context.client.user?.setActivity(`${currentTimeStr} / ${totalTimeStr}`, { type: ActivityType.Listening });
                if (message && message.editable) {
                    message.edit({ embeds: [createEmbed(currentTimeStr, totalTimeStr, isPaused)], components: [createButtons(isPaused), ...(chapterMenu ? [chapterMenu] : [])] }).catch(() => {});
                }
            }
        }, 5000);

        playbackSessions.set(guildId, { interval, currentResource: resource, currentUrl: cleanUrl, startTimeSeconds: effectiveSkip, player, message, collector, queue: state?.queue || [input] });

        player.on(AudioPlayerStatus.Idle, async () => {
            const s = playbackSessions.get(guildId);
            if (s) {
                if (s.interval) clearInterval(s.interval);
                s.queue.shift();
                if (s.queue.length > 0) {
                    await playYouTube(s.queue[0], context, 0, true);
                } else {
                    playbackSessions.delete(guildId);
                    context.client.user?.setActivity(null);
                    if (message && message.editable) message.edit({ components: [] }).catch(() => {});
                    if (context.channel && 'send' in context.channel) await context.channel.send(RESPONSE_FINISHED_PLAYING).catch(() => {});
                    else await sendResponse(context, RESPONSE_FINISHED_PLAYING).catch(() => {});
                }
            }
        });

        player.on('error', error => {
            console.error(`${LOG_PREFIX_AUDIOPLAYER_ERROR} ${error.message}`);
            logError(error, { method: 'AudioPlayer:error', guild_id: guildId, additional_info: { url: cleanUrl } });
            const s = playbackSessions.get(guildId);
            if (s?.interval) { clearInterval(s.interval); playbackSessions.delete(guildId); }
            if (message && message.editable) message.edit({ content: `${EMOJI_ERROR} **${ERROR_GENERIC}**\n*(Playback Error: ${error.message})*`, components: [] }).catch(() => {});
        });

    } catch (error: any) {
        console.error(LOG_PREFIX_PLAY_ERROR, error.message);
        logError(error, { method: 'playYouTube:fatal', user_id: getUserId(context), guild_id: context.guild?.id, channel_id: context.channel?.id, additional_info: { url: url } });
        const s = playbackSessions.get(guildId);
        if (s?.interval) { clearInterval(s.interval); playbackSessions.delete(guildId); }
        await sendResponse(context, `${EMOJI_ERROR} **${ERROR_GENERIC}**\n*(Technical Error: ${error.message})*`);
    }
}
