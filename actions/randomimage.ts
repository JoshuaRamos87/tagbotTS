import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as db from '../utils/database.js';

// Track active syncs to avoid overlapping
const activeSyncs = new Set<string>();

// Helper to check if an attachment is an image
function isImage(url: string) {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext || '');
}

// Migrate existing JSON data to SQLite if available
function migrateJsonToDb(channelID: string) {
    const jsonPath = path.join('./data', channelID, 'images.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            const imagesToSave = Object.values(data).map((item: any) => ({
                author: item.author,
                url: item.image
            }));
            
            if (imagesToSave.length > 0) {
                db.saveImages(channelID, imagesToSave);
                console.log(`Migrated ${imagesToSave.length} images for channel ${channelID} to SQLite.`);
            }
            
            fs.renameSync(jsonPath, jsonPath + '.migrated');
        } catch (err) {
            console.error(`Error migrating JSON for channel ${channelID}:`, err);
        }
    }
}

export async function getImage(context, count = 1) {
    let channelID = context.channel.id;

    if (context.channel.isThread()) {
        channelID = context.channel.parentId;
    }

    if (!db.hasImages(channelID)) {
        migrateJsonToDb(channelID);
    }

    if (db.hasImages(channelID)) {
        const images = db.getRandomImages(channelID, count);
        if (images.length > 0) {
            const refreshedImages = await Promise.all(images.map(img => refreshImageUrl(context, channelID, img)));
            await deliverImages(context, channelID, refreshedImages);
        }

        const lastId = db.getLastImageId(channelID);
        if (lastId) {
            syncNewImages(context, channelID, lastId).catch(err => console.error("Background sync error:", err.message));
        }
    } else {
        await fetchAllImages(context, channelID, count);
    }
}

async function refreshImageUrl(context, channelID, img) {
    if (!img.message_id) return img;

    try {
        const url = new URL(img.url);
        const expiryHex = url.searchParams.get('ex');
        if (expiryHex) {
            const expiryTs = parseInt(expiryHex, 16) * 1000;
            if (expiryTs - Date.now() < 3600000) {
                const channel = await context.client.channels.fetch(channelID);
                const message = await channel.messages.fetch(img.message_id);
                
                const originalBase = img.url.split('?')[0];
                const freshAttachment = message.attachments.find(a => a.url.split('?')[0] === originalBase);
                
                if (freshAttachment) {
                    db.updateImageUrl(img.id, freshAttachment.url);
                    return { ...img, url: freshAttachment.url };
                }
            }
        }
    } catch (err) {
        console.error(`Failed to refresh URL for message ${img.message_id}:`, err.message);
    }
    return img;
}

async function deliverImages(context, channelID, images) {
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
                
                if (row.components.length < 5) {
                    row.addComponents(jumpButton);
                }
            }
            
            return embed;
        });

        const payload: any = { embeds };
        if (row.components.length > 0) payload.components = [row];

        await sendResponse(context, payload);
    }
}

async function sendResponse(context, content) {
    const isExpired = context.createdTimestamp && (Date.now() - context.createdTimestamp > 14 * 60 * 1000);

    if (context.reply && !isExpired) {
        try {
            if (context.deferred && !context.replied) {
                return await context.editReply(content);
            }
            if (context.replied || context.deferred) {
                return await context.followUp(content);
            }
            return await context.reply(content);
        } catch (err) {
            console.error("Interaction response failed, falling back to channel send:", err.message);
        }
    }
    
    if (context.channel) {
        return await context.channel.send(content);
    }
}

async function syncNewImages(context, channelID, lastId) {
    if (activeSyncs.has(channelID)) return;
    activeSyncs.add(channelID);

    try {
        console.log(`[SYNC] Starting background image sync for channel ${channelID} after message ${lastId}...`);
        const channel = await context.client.channels.fetch(channelID);
        let newImages = [];
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
            currentAfter = messages.lastKey(); 

            if (newImages.length >= 100) {
                const inserted = db.saveImages(channelID, newImages);
                totalSynced += inserted;
                console.log(`[SYNC] Image batch processed: ${totalSynced} actual new images saved...`);
                newImages = [];
            }
        }

        if (newImages.length > 0) {
            const inserted = db.saveImages(channelID, newImages);
            totalSynced += inserted;
        }
        
        if (totalSynced > 0) {
            console.log(`[SYNC] Finished image sync for ${channelID}: +${totalSynced} actual new images.`);
        } else {
            console.log(`[SYNC] Image sync for ${channelID} complete: No new unique images found.`);
        }
    } catch (err) {
        console.error(`[SYNC] Image sync error for ${channelID}:`, err.message);
    } finally {
        console.log(`[SYNC] Background process ended for channel ${channelID}.`);
        activeSyncs.delete(channelID);
    }
}

async function fetchAllImages(context, channelID, initialCount = 1) {
    try {
        let client = context.client;
        const channel = await client.channels.fetch(channelID);
        if (!channel.isTextBased()) return;

        const createdTimestamp = channel.createdTimestamp;
        const now = Date.now();
        const duration = now - createdTimestamp;
        const numWorkers = 12;
        const chunkDuration = Math.floor(duration / numWorkers);

        let totalSaved = 0;
        let activeWorkers = numWorkers;

        const initialEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle("🚀 Super-Crawler Initialized")
            .setDescription(`Building a massive index for <#${channelID}>.\n\n**Workers:** ⚙️ Starting ${numWorkers} parallel crawlers...`);

        const message = await sendResponse(context, { embeds: [initialEmbed] });

        const progressInterval = setInterval(async () => {
            const updateEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle("🚀 Super-Crawler Scanning...")
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
                    await crawlAndStreamImages(channel, endId, segmentStart, (count) => {
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
                .setTitle("✅ Super-Crawl Complete")
                .setDescription(`Finished indexing **${totalSaved.toLocaleString()}** unique images in <#${channelID}>!`);
            
            if (message && message.edit) await message.edit({ embeds: [successEmbed] });
            else await sendResponse(context, { embeds: [successEmbed] });
            
            const refreshedImages = await Promise.all(images.map(img => refreshImageUrl(context, channelID, img)));
            await deliverImages(context, channelID, refreshedImages);
        } else {
            await sendResponse(context, "I couldn't find any images in this channel!");
        }
    } catch (err) {
        console.error(err);
    }
}

async function crawlAndStreamImages(channel, beforeId, untilTimestamp, onBatchSaved) {
    let currentBefore = beforeId;
    let localBatch = [];

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
        currentBefore = messages.lastKey();
    }

    if (localBatch.length > 0) {
        const inserted = db.saveImages(channel.id, localBatch);
        onBatchSaved(inserted);
    }
}
