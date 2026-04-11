import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder } from 'discord.js';
import * as db from '../utils/database.js';

const activeSyncs = new Set<string>();

// Migrate existing JSON data to SQLite if available
function migrateJsonToDb(channelID: string) {
    const jsonPath = path.join('./data', channelID, 'tweets.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            const tweetsToSave = Object.values(data).map((item: any) => ({
                author: item.author,
                content: item.tweet
            }));
            
            if (tweetsToSave.length > 0) {
                db.saveTweets(channelID, tweetsToSave);
                console.log(`Migrated ${tweetsToSave.length} tweets for channel ${channelID} to SQLite.`);
            }
            
            fs.renameSync(jsonPath, jsonPath + '.migrated');
        } catch (err) {
            console.error(`Error migrating JSON for channel ${channelID}:`, err);
        }
    }
}

export async function getTweet(context, flags) {
    const channelID = context.channel.id;

    if (flags.refresh) {
        db.clearChannelTweets(channelID);
    } else if (!db.hasTweets(channelID)) {
        migrateJsonToDb(channelID);
    }

    if (db.hasTweets(channelID)) {
        // 1. Deliver result INSTANTLY
        const tweet = db.getRandomTweet(channelID);
        if (tweet) {
            await sendResponse(context, `${tweet.author}: ${tweet.content}`);
        }

        // 2. Sync in BACKGROUND
        const lastId = db.getLastTweetId(channelID);
        if (lastId) {
            syncNewTweets(context, channelID, lastId).catch(err => console.error("Tweet sync error:", err));
        }
    } else {
        await fetchAllTweets(context);
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

async function syncNewTweets(context, channelID, lastId) {
    if (activeSyncs.has(channelID)) return;
    activeSyncs.add(channelID);

    try {
        console.log(`[SYNC] Starting background tweet sync for channel ${channelID} after message ${lastId}...`);
        const channel = await context.client.channels.fetch(channelID);
        let newTweets = [];
        let currentAfter = lastId;
        let totalSynced = 0;

        while (true) {
            const messages = await channel.messages.fetch({ limit: 100, after: currentAfter });
            if (messages.size === 0) break;

            messages.forEach(msg => {
                if (msg.content.includes("twitter.com") && !msg.author.bot) {
                    newTweets.push({
                        author: msg.author.username,
                        content: msg.content,
                        message_id: msg.id
                    });
                }
            });
            currentAfter = messages.lastKey(); // CORRECTED

            if (newTweets.length >= 100) {
                db.saveTweets(channelID, newTweets);
                totalSynced += newTweets.length;
                console.log(`[SYNC] Tweet batch saved: ${totalSynced} new tweets found so far...`);
                newTweets = [];
            }
        }

        if (newTweets.length > 0) {
            db.saveTweets(channelID, newTweets);
            totalSynced += newTweets.length;
        }

        if (totalSynced > 0) {
            console.log(`[SYNC] Finished tweet sync for ${channelID}: +${totalSynced} new tweets.`);
        } else {
            console.log(`[SYNC] Tweet sync for ${channelID} complete: No new tweets found.`);
        }
    } catch (err) {
        console.error(`[SYNC] Tweet sync error for ${channelID}:`, err);
    } finally {
        console.log(`[SYNC] Background process ended for channel ${channelID}.`);
        activeSyncs.delete(channelID);
    }
}

async function fetchAllTweets(context) {
    try {
        let channelID = context.channel.id;
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
            .setColor(0x1DA1F2)
            .setTitle("🐦 Super-Tweet-Crawler Active")
            .setDescription(`Scanning <#${channelID}> for twitter links.\n\n**Workers:** ⚙️ Starting ${numWorkers} parallel crawlers...`);

        const message = await sendResponse(context, { embeds: [initialEmbed] });

        const progressInterval = setInterval(async () => {
            const updateEmbed = new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setTitle("🐦 Super-Tweet-Crawler Scanning...")
                .setDescription(`Building a tweet index for <#${channelID}>.\n\n**Found:** 🐦 **${totalFound.toLocaleString()}** tweets\n**Active Workers:** ⚙️ ${activeWorkers}/${numWorkers}`);

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
                    await crawlAndStreamTweets(channel, endId, segmentStart, (count) => {
                        totalFound += count;
                    });
                } finally {
                    activeWorkers--;
                }
            })());
        }

        await Promise.all(workerPromises);
        clearInterval(progressInterval);

        const tweet = db.getRandomTweet(channelID);
        if (tweet) {
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Super-Tweet-Crawl Complete")
                .setDescription(`Finished indexing **${totalFound.toLocaleString()}** tweets in <#${channelID}>!`);
            
            if (message.edit) await message.edit({ embeds: [successEmbed] });
            await sendResponse(context, `${tweet.author}: ${tweet.content}`);
        } else {
            sendResponse(context, "I couldn't find any tweets in this channel!");
        }
    } catch (err) {
        console.error(err);
    }
}

async function crawlAndStreamTweets(channel, beforeId, untilTimestamp, onBatchFound) {
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

            if (msg.content.includes("twitter.com") && !msg.author.bot) {
                localBatch.push({
                    author: msg.author.username,
                    content: msg.content,
                    message_id: msg.id
                });
            }
        }

        if (localBatch.length >= 200) {
            db.saveTweets(channel.id, localBatch);
            onBatchFound(localBatch.length);
            localBatch = [];
        }

        if (reachedBoundary) break;
        currentBefore = messages.lastKey();
    }

    if (localBatch.length > 0) {
        db.saveTweets(channel.id, localBatch);
        onBatchFound(localBatch.length);
    }
}
