import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder } from 'discord.js';
import * as db from '../utils/database.js';

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
            
            // Rename the old file to mark it as migrated
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
        
        // Try to migrate if not already done
        if (!db.hasImages(susChannelId)) {
            migrateJsonToDb(susChannelId);
        }

        if (!db.hasImages(susChannelId)) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle("Access Denied")
                .setDescription("Nice try, but I couldn't find those images. :P");
            sendResponse(context, { embeds: [embed] });
            return;
        }

        const img = db.getRandomImage(susChannelId);
        if (img) {
            sendResponse(context, `${img.author}: ${img.url}`);
        }
        return;
    }

    // Refresh if requested
    if (flags.refresh) {
        db.clearChannelImages(channelID);
    } else {
        // Attempt migration for existing data if we don't have records in DB
        if (!db.hasImages(channelID)) {
            migrateJsonToDb(channelID);
        }
    }

    if (db.hasImages(channelID)) {
        const img = db.getRandomImage(channelID);
        if (img) {
            sendResponse(context, `${img.author}: ${img.url}`);
        }
    } else {
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

async function fetchAllImages(context, channelID) {
    try {
        let client = context.client;
        const channel = await client.channels.fetch(channelID);
        if (!channel.isTextBased()) return;

        const createdTimestamp = channel.createdTimestamp;
        const now = Date.now();
        const duration = now - createdTimestamp;
        const numWorkers = 12; // INCREASED WORKERS
        const chunkDuration = Math.floor(duration / numWorkers);

        let totalFound = 0;
        let activeWorkers = numWorkers;

        const initialEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle("🚀 Super-Crawler Initialized")
            .setDescription(`Building a massive index for <#${channelID}>.\n\n**Workers:** ⚙️ Starting ${numWorkers} parallel crawlers...`)
            .setFooter({ text: "Please wait, this will be faster than ever!" });

        const message = await sendResponse(context, { embeds: [initialEmbed] });

        // PROGRESS TRACKER: Update Discord UI every 3 seconds
        const progressInterval = setInterval(async () => {
            const updateEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle("🚀 Super-Crawler Scanning...")
                .setDescription(`Building an image index for <#${channelID}>.\n\n**Found:** 🖼️ **${totalFound.toLocaleString()}** images\n**Active Workers:** ⚙️ ${activeWorkers}/${numWorkers}`)
                .setFooter({ text: "Indexing is streaming to the database in real-time." });

            try {
                if (message.edit) {
                    await message.edit({ embeds: [updateEmbed] });
                }
            } catch (e) {
                // Ignore if message was deleted or couldn't edit
            }
        }, 3000);

        const workerPromises = [];
        for (let i = 0; i < numWorkers; i++) {
            const segmentEnd = now - (i * chunkDuration);
            const segmentStart = (i === numWorkers - 1) ? createdTimestamp : now - ((i + 1) * chunkDuration);
            const endId = SnowflakeUtil.generate({ timestamp: segmentEnd }).toString();
            
            // Worker function with real-time saving
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
                .setDescription(`Finished indexing **${totalFound.toLocaleString()}** images in <#${channelID}>!\n\nAll data is safely secured in SQLite.`);
            
            // Edit final status
            if (message.edit) await message.edit({ embeds: [successEmbed] });
            else await sendResponse(context, { embeds: [successEmbed] });

            await sendResponse(context, `${finalImg.author}: ${finalImg.url}`);
        } else {
            sendResponse(context, "I couldn't find any images in this channel!");
        }
    } catch (err) {
        console.error(err);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle("💥 Crawler Failure")
            .setDescription("The crawler encountered a critical error. Check logs for details.");
        sendResponse(context, { embeds: [errorEmbed] });
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
                    url: msg.attachments.first().url
                });
            }
        }

        // SAVE BATCH: Push to DB every 200 items found by this worker
        if (localBatch.length >= 200) {
            db.saveImages(channel.id, localBatch);
            onBatchFound(localBatch.length);
            localBatch = [];
        }

        if (reachedBoundary) break;
        currentBefore = messages.lastKey();
    }

    // FINAL SAVE: Push remaining items
    if (localBatch.length > 0) {
        db.saveImages(channel.id, localBatch);
        onBatchFound(localBatch.length);
    }
}
