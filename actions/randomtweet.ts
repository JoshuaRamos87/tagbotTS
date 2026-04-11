import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder } from 'discord.js';
import * as db from '../utils/database.js';

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
            
            // Rename the old file to mark it as migrated
            fs.renameSync(jsonPath, jsonPath + '.migrated');
        } catch (err) {
            console.error(`Error migrating JSON for channel ${channelID}:`, err);
        }
    }
}

export async function getTweet(context, flags) {
    const channelID = context.channel.id;

    // Refresh if requested
    if (flags.refresh) {
        db.clearChannelTweets(channelID);
    } else {
        // Attempt migration for existing data if we don't have records in DB
        if (!db.hasTweets(channelID)) {
            migrateJsonToDb(channelID);
        }
    }

    if (db.hasTweets(channelID)) {
        const tweet = db.getRandomTweet(channelID);
        if (tweet) {
            sendResponse(context, `${tweet.author}: ${tweet.content}`);
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

async function fetchAllTweets(context) {
    try {
        let channelID = context.channel.id;
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
            .setColor(0x1DA1F2)
            .setTitle("🐦 Super-Tweet-Crawler Active")
            .setDescription(`Scanning <#${channelID}> for twitter links.\n\n**Workers:** ⚙️ Starting ${numWorkers} parallel crawlers...`)
            .setFooter({ text: "Indexing the history at maximum speed." });

        const message = await sendResponse(context, { embeds: [initialEmbed] });

        // PROGRESS TRACKER: Update Discord UI every 3 seconds
        const progressInterval = setInterval(async () => {
            const updateEmbed = new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setTitle("🐦 Super-Tweet-Crawler Scanning...")
                .setDescription(`Building a tweet index for <#${channelID}>.\n\n**Found:** 🐦 **${totalFound.toLocaleString()}** tweets\n**Active Workers:** ⚙️ ${activeWorkers}/${numWorkers}`)
                .setFooter({ text: "Tweets are being committed to SQLite in real-time." });

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
                .setDescription(`Finished indexing **${totalFound.toLocaleString()}** tweets in <#${channelID}>!\n\nDatabase is now synchronized.`);
            
            if (message.edit) await message.edit({ embeds: [successEmbed] });
            else await sendResponse(context, { embeds: [successEmbed] });

            await sendResponse(context, `${tweet.author}: ${tweet.content}`);
        } else {
            sendResponse(context, "I couldn't find any tweets in this channel!");
        }
    } catch (err) {
        console.error(err);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle("💥 Crawler Error")
            .setDescription("A critical error occurred while scanning for tweets.");
        sendResponse(context, { embeds: [errorEmbed] });
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
                    content: msg.content
                });
            }
        }

        // SAVE BATCH: every 200 tweets
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
