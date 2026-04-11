import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder } from 'discord.js';
import * as db from '../utils/database.js';

// Track active syncs to avoid overlapping
const activeSyncs = new Set<string>();

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

export async function getImage(context, flags) {
    let channelID = context.channel.id;

    if (context.channel.isThread()) {
        channelID = context.channel.parentId;
    }

    if (flags.sus) {
        const susChannelId = "1010205484554391552";
        if (!db.hasImages(susChannelId)) migrateJsonToDb(susChannelId);

        if (!db.hasImages(susChannelId)) {
            const embed = new EmbedBuilder().setColor(0xFF0000).setTitle("Access Denied").setDescription("Nice try, but I couldn't find those images. :P");
            sendResponse(context, { embeds: [embed] });
            return;
        }

        const img = db.getRandomImage(susChannelId);
        if (img) sendResponse(context, `${img.author}: ${img.url}`);
        return;
    }

    // Refresh
    if (flags.refresh) {
        db.clearChannelImages(channelID);
    } else if (!db.hasImages(channelID)) {
        migrateJsonToDb(channelID);
    }

    if (db.hasImages(channelID)) {
        // 1. Deliver result INSTANTLY from DB
        const img = db.getRandomImage(channelID);
        if (img) {
            await sendResponse(context, `${img.author}: ${img.url}`);
        }

        // 2. Sync in the BACKGROUND (Non-blocking)
        const lastId = db.getLastImageId(channelID);
        if (lastId) {
            syncNewImages(context, channelID, lastId).catch(err => console.error("Background sync error:", err));
        }
    } else {
        // Initial crawl is still blocking because we have nothing to show yet
        await fetchAllImages(context, channelID);
    }
}

async function sendResponse(context, content) {
    if (context.reply) {
        if (context.deferred || context.replied) {
            return context.followUp(content);
        }
        return context.reply(content);
    }
    return context.channel.send(content);
}

// FAST FORWARD SYNC (Background)
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
                if (msg.attachments.size > 0) {
                    newImages.push({
                        author: msg.author.username,
                        url: msg.attachments.first().url,
                        message_id: msg.id
                    });
                }
            });
            currentAfter = messages.firstKey(); // Newest in batch
            
            if (newImages.length >= 100) {
                db.saveImages(channelID, newImages);
                totalSynced += newImages.length;
                console.log(`[SYNC] Image batch saved: ${totalSynced} new images found so far...`);
                newImages = [];
            }
        }

        if (newImages.length > 0) {
            db.saveImages(channelID, newImages);
            totalSynced += newImages.length;
        }
        
        if (totalSynced > 0) {
            console.log(`[SYNC] Finished image sync for ${channelID}: +${totalSynced} new images.`);
        } else {
            console.log(`[SYNC] Image sync for ${channelID} complete: No new images found.`);
        }
    } finally {
        activeSyncs.delete(channelID);
    }
}

async function fetchAllImages(context, channelID) {
    try {
        let client = context.client;
        const channel = await client.channels.fetch(channelID);
        if (!channel.isTextBased()) return;

        const createdTimestamp = channel.createdTimestamp;
        const now = Date.now();
        const duration = now - createdTimestamp;
        const numWorkers = 12;
        const chunkDuration = Math.floor(duration / numWorkers);

        let totalFound = 0;
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
                .setDescription(`Building an image index for <#${channelID}>.\n\n**Found:** 🖼️ **${totalFound.toLocaleString()}** images\n**Active Workers:** ⚙️ ${activeWorkers}/${numWorkers}`);

            try {
                if (message.edit) await message.edit({ embeds: [updateEmbed] });
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
                        totalFound += count;
                    });
                } finally {
                    activeWorkers--;
                }
            })());
        }

        await Promise.all(workerPromises);
        clearInterval(progressInterval);

        const finalImg = db.getRandomImage(channelID);
        if (finalImg) {
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Super-Crawl Complete")
                .setDescription(`Finished indexing **${totalFound.toLocaleString()}** images in <#${channelID}>!`);
            
            if (message.edit) await message.edit({ embeds: [successEmbed] });
            await sendResponse(context, `${finalImg.author}: ${finalImg.url}`);
        } else {
            sendResponse(context, "I couldn't find any images in this channel!");
        }
    } catch (err) {
        console.error(err);
    }
}

async function crawlAndStreamImages(channel, beforeId, untilTimestamp, onBatchFound) {
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

            if (msg.attachments.size > 0) {
                localBatch.push({
                    author: msg.author.username,
                    url: msg.attachments.first().url,
                    message_id: msg.id
                });
            }
        }

        if (localBatch.length >= 200) {
            db.saveImages(channel.id, localBatch);
            onBatchFound(localBatch.length);
            localBatch = [];
        }

        if (reachedBoundary) break;
        currentBefore = messages.lastKey();
    }

    if (localBatch.length > 0) {
        db.saveImages(channel.id, localBatch);
        onBatchFound(localBatch.length);
    }
}
