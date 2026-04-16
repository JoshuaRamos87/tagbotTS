import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextBasedChannel, Message } from 'discord.js';
import * as db from '../utils/database.js';
import { BotContext } from '../utils/types.js';
import { sendResponse, getUserId } from '../utils/response.js';
import { 
    LOG_PREFIX_SYNC, 
    LOG_PREFIX_LOADER, 
    EMOJI_RELOAD, 
    BUTTON_ID_RANDOM_IMAGE_RELOAD_PREFIX, 
    EMBED_TITLE_SUPER_CRAWLER_INIT, 
    EMBED_TITLE_SUPER_CRAWLER_SCAN, 
    EMBED_TITLE_SUPER_CRAWLER_COMPLETE 
} from '../utils/constants/index.js';

// Track active syncs to avoid overlapping
const activeSyncs = new Set<string>();

// Helper to check if an attachment is an image
function isImage(url: string) {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext || '');
}

export async function getImage(context: BotContext, count = 1) {
    if (!context.channel) return;
    let channelID = context.channel.id;

    if (context.channel.isThread()) {
        channelID = context.channel.parentId as string;
    }

    if (db.hasImages(channelID)) {
        const images = db.getRandomImages(channelID, count);
        if (images.length > 0) {
            const refreshedImages = await Promise.all(images.map(img => refreshImageUrl(context, channelID, img)));
            await deliverImages(context, channelID, refreshedImages);
        }

        const lastId = db.getLastImageId(channelID);
        if (lastId) {
            syncNewImages(context, channelID, lastId).catch((err: any) => console.error(`${LOG_PREFIX_SYNC} Background sync error:`, err.message));
        }
    } else {
        await fetchAllImages(context, channelID, count);
    }
}

async function refreshImageUrl(context: BotContext, channelID: string, img: db.ImageRecord) {
    if (!img.message_id) return img;

    try {
        const url = new URL(img.url);
        const expiryHex = url.searchParams.get('ex');
        if (expiryHex) {
            const expiryTs = parseInt(expiryHex, 16) * 1000;
            if (expiryTs - Date.now() < 3600000) {
                const channel = await context.client.channels.fetch(channelID) as TextBasedChannel;
                const message = await channel.messages.fetch(img.message_id);
                
                const originalBase = img.url.split('?')[0];
                const freshAttachment = message.attachments.find(a => a.url.split('?')[0] === originalBase);
                
                if (freshAttachment) {
                    db.updateImageUrl(img.id, freshAttachment.url);
                    return { ...img, url: freshAttachment.url };
                }
            }
        }
    } catch (err: any) {
        console.error(`${LOG_PREFIX_LOADER} Failed to refresh URL for message ${img.message_id}:`, err.message);
    }
    return img;
}

async function deliverImages(context: BotContext, channelID: string, images: db.ImageRecord[]) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    if (images.length === 1) {
        const img = images[0];
        let response = `**${img.author}**: ${img.url}`;
        
        if (img.message_id) {
            const jumpUrl = `https://discord.com/channels/${context.guildId}/${channelID}/${img.message_id}`;
            const jumpButton = new ButtonBuilder()
                .setLabel('Jump to Original Post')
                .setStyle(ButtonStyle.Link)
                .setURL(jumpUrl);
            row.addComponents(jumpButton);
        }

        const reloadButton = new ButtonBuilder()
            .setCustomId(`${BUTTON_ID_RANDOM_IMAGE_RELOAD_PREFIX}${images.length}`)
            .setLabel('Reload')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(EMOJI_RELOAD);
        
        row.addComponents(reloadButton);
        
        const payload: any = { content: response };
        if (row.components.length > 0) payload.components = [row];
        
        await sendResponse(context, payload);
    } else {
        const sharedUrl = images[0].url;
        const embeds = images.map((img, index) => {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setURL(sharedUrl)
                .setAuthor({ name: `Posted by: ${img.author}` })
                .setImage(img.url);
            
            if (img.message_id) {
                const jumpUrl = `https://discord.com/channels/${context.guildId}/${channelID}/${img.message_id}`;
                const jumpButton = new ButtonBuilder()
                    .setLabel(`Jump to #${index + 1}`)
                    .setStyle(ButtonStyle.Link)
                    .setURL(jumpUrl);
                
                if (row.components.length < 4) { // Save space for reload
                    row.addComponents(jumpButton);
                }
            }
            
            return embed;
        });

        const reloadButton = new ButtonBuilder()
            .setCustomId(`${BUTTON_ID_RANDOM_IMAGE_RELOAD_PREFIX}${images.length}`)
            .setLabel('Reload')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(EMOJI_RELOAD);

        row.addComponents(reloadButton);

        const payload: any = { embeds };
        if (row.components.length > 0) payload.components = [row];

        await sendResponse(context, payload);
    }
}

async function syncNewImages(context: BotContext, channelID: string, lastId: string) {
    if (activeSyncs.has(channelID)) return;
    activeSyncs.add(channelID);

    try {
        console.log(`${LOG_PREFIX_SYNC} Starting background image sync for channel ${channelID} after message ${lastId}...`);
        const channel = await context.client.channels.fetch(channelID) as TextBasedChannel;
        let newImages: { author: string, url: string, message_id: string }[] = [];
        let currentAfter = lastId;
        let totalSynced = 0;

        while (true) {
            const messages = await channel.messages.fetch({ limit: 100, after: currentAfter });
            if (messages.size === 0) break;

            messages.forEach(msg => {
                if (msg.attachments.size > 0 && !msg.author.bot) {
                    msg.attachments.forEach(attachment => {
                        if (isImage(attachment.url)) {
                            newImages.push({
                                author: msg.author.username,
                                url: attachment.url,
                                message_id: msg.id
                            });
                        }
                    });
                }
            });
            currentAfter = messages.lastKey() as string; 

            if (newImages.length >= 100) {
                const inserted = db.saveImages(channelID, newImages);
                totalSynced += inserted;
                console.log(`${LOG_PREFIX_SYNC} Image batch processed: ${totalSynced} actual new images saved...`);
                newImages = [];
            }
        }

        if (newImages.length > 0) {
            const inserted = db.saveImages(channelID, newImages);
            totalSynced += inserted;
        }
        
        if (totalSynced > 0) {
            console.log(`${LOG_PREFIX_SYNC} Finished image sync for ${channelID}: +${totalSynced} actual new images.`);
        } else {
            console.log(`${LOG_PREFIX_SYNC} Image sync for ${channelID} complete: No new unique images found.`);
        }
    } catch (err: any) {
        console.error(`${LOG_PREFIX_SYNC} Image sync error for ${channelID}:`, err.message);
        db.logError(err, {
            method: 'syncNewImages',
            channel_id: channelID
        });
    } finally {
        console.log(`${LOG_PREFIX_SYNC} Background process ended for channel ${channelID}.`);
        activeSyncs.delete(channelID);
    }
}

async function fetchAllImages(context: BotContext, channelID: string, initialCount = 1) {
    try {
        let client = context.client;
        const channel = await client.channels.fetch(channelID);
        if (!channel || !channel.isTextBased() || !('createdTimestamp' in channel)) return;

        const createdTimestamp = channel.createdTimestamp as number;
        const now = Date.now();
        const duration = now - createdTimestamp;
        const numWorkers = 12;
        const chunkDuration = Math.floor(duration / numWorkers);

        let totalSaved = 0;
        let activeWorkers = numWorkers;

        const initialEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(EMBED_TITLE_SUPER_CRAWLER_INIT)
            .setDescription(`Building a massive index for <#${channelID}>.\n\n**Workers:** ⚙️ Starting ${numWorkers} parallel crawlers...`);

        const response = await sendResponse(context, { embeds: [initialEmbed] });
        const message = response instanceof Message ? response : null;

        const progressInterval = setInterval(async () => {
            const updateEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(EMBED_TITLE_SUPER_CRAWLER_SCAN)
                .setDescription(`Building an image index for <#${channelID}>.\n\n**New Images Saved:** 🖼️ **${totalSaved.toLocaleString()}**\n**Active Workers:** ⚙️ ${activeWorkers}/${numWorkers}`);

            try {
                if (message && message.edit) await message.edit({ embeds: [updateEmbed] });
            } catch (e) {}
        }, 3000);

        const workerPromises = [];
        for (let i = 0; i < numWorkers; i++) {
            const segmentEnd = now - (i * chunkDuration);
            const segmentStart = (i === numWorkers - 1) ? createdTimestamp : now - ((i + 1) * chunkDuration);
            const endId = SnowflakeUtil.generate({ timestamp: segmentEnd }).toString();
            
            workerPromises.push((async () => {
                try {
                    await crawlAndStreamImages(channel as TextBasedChannel, endId, segmentStart, (count: number) => {
                        totalSaved += count;
                    });
                } finally {
                    activeWorkers--;
                }
            })());
        }

        await Promise.all(workerPromises);
        clearInterval(progressInterval);

        const images = db.getRandomImages(channelID, initialCount);
        if (images.length > 0) {
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(EMBED_TITLE_SUPER_CRAWLER_COMPLETE)
                .setDescription(`Finished indexing **${totalSaved.toLocaleString()}** unique images in <#${channelID}>!`);
            
            if (message && message.edit) await message.edit({ embeds: [successEmbed] });
            else await sendResponse(context, { embeds: [successEmbed] });
            
            const refreshedImages = await Promise.all(images.map(img => refreshImageUrl(context, channelID, img)));
            await deliverImages(context, channelID, refreshedImages);
        } else {
            await sendResponse(context, "I couldn't find any images in this channel!");
        }
    } catch (err: any) {
        console.error(err);
        db.logError(err, {
            method: 'fetchAllImages',
            user_id: getUserId(context),
            guild_id: context.guildId || undefined,
            channel_id: channelID
        });
    }
}

async function crawlAndStreamImages(channel: TextBasedChannel, beforeId: string, untilTimestamp: number, onBatchSaved: (count: number) => void) {
    let currentBefore = beforeId;
    let localBatch: { author: string, url: string, message_id: string }[] = [];

    while (true) {
        const messages = await channel.messages.fetch({ limit: 100, before: currentBefore });
        if (messages.size === 0) break;

        let reachedBoundary = false;
        for (const msg of messages.values()) {
            if (msg.createdTimestamp < untilTimestamp) {
                reachedBoundary = true;
                break;
            }

            if (msg.attachments.size > 0 && !msg.author.bot) {
                msg.attachments.forEach(attachment => {
                    if (isImage(attachment.url)) {
                        localBatch.push({
                            author: msg.author.username,
                            url: attachment.url,
                            message_id: msg.id
                        });
                    }
                });
            }
        }

        if (localBatch.length >= 200) {
            const inserted = db.saveImages(channel.id, localBatch);
            onBatchSaved(inserted);
            localBatch = [];
        }

        if (reachedBoundary) break;
        currentBefore = messages.lastKey() as string;
    }

    if (localBatch.length > 0) {
        const inserted = db.saveImages(channel.id, localBatch);
        onBatchSaved(inserted);
    }
}
