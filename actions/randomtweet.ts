import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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

export async function getTweet(context, count = 1) {
    const channelID = context.channel.id;

    if (!db.hasTweets(channelID)) {
        migrateJsonToDb(channelID);
    }

    if (db.hasTweets(channelID)) {
        const tweets = db.getRandomTweets(channelID, count);
        if (tweets.length > 0) {
            const refreshedTweets = await Promise.all(tweets.map(t => refreshTweetContent(context, channelID, t)));
            await deliverTweets(context, channelID, refreshedTweets);
        }

        const lastId = db.getLastTweetId(channelID);
        if (lastId) {
            syncNewTweets(context, channelID, lastId).catch(err => console.error("Tweet sync error:", err.message));
        }
    } else {
        await fetchAllTweets(context, count);
    }
}

async function refreshTweetContent(context, channelID, tweet) {
    if (!tweet.message_id || !tweet.content.includes("cdn.discordapp.com")) return tweet;

    try {
        if (tweet.content.includes("ex=")) {
            const urlMatch = tweet.content.match(/https:\/\/cdn\.discordapp\.com\/attachments\/[^\s]+/);
            if (urlMatch) {
                const url = new URL(urlMatch[0]);
                const expiryHex = url.searchParams.get('ex');
                if (expiryHex) {
                    const expiryTs = parseInt(expiryHex, 16) * 1000;
                    if (expiryTs - Date.now() < 3600000) {
                        const channel = await context.client.channels.fetch(channelID);
                        const message = await channel.messages.fetch(tweet.message_id);
                        db.updateTweetContent(tweet.id, message.content);
                        return { ...tweet, content: message.content };
                    }
                }
            }
        }
    } catch (err) {
        console.error(`Failed to refresh tweet message ${tweet.message_id}:`, err.message);
    }
    return tweet;
}

async function deliverTweets(context, channelID, tweets) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    if (tweets.length === 1) {
        const tweet = tweets[0];
        let response = `**${tweet.author}**: ${tweet.content}`;
        
        if (tweet.message_id) {
            const jumpUrl = `https://discord.com/channels/${context.guildId}/${channelID}/${tweet.message_id}`;
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
        const embeds = tweets.map((tweet, index) => {
            const embed = new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setAuthor({ name: `Posted by: ${tweet.author}` })
                .setDescription(tweet.content);
            
            if (tweet.message_id) {
                const jumpUrl = `https://discord.com/channels/${context.guildId}/${channelID}/${tweet.message_id}`;
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
            currentAfter = messages.lastKey();

            if (newTweets.length >= 100) {
                const inserted = db.saveTweets(channelID, newTweets);
                totalSynced += inserted;
                console.log(`[SYNC] Tweet batch processed: ${totalSynced} actual new tweets saved...`);
                newTweets = [];
            }
        }

        if (newTweets.length > 0) {
            const inserted = db.saveTweets(channelID, newTweets);
            totalSynced += inserted;
        }

        if (totalSynced > 0) {
            console.log(`[SYNC] Finished tweet sync for ${channelID}: +${totalSynced} actual new tweets.`);
        } else {
            console.log(`[SYNC] Tweet sync for ${channelID} complete: No new unique tweets found.`);
        }
    } catch (err) {
        console.error(`[SYNC] Tweet sync error for ${channelID}:`, err.message);
    } finally {
        console.log(`[SYNC] Background process ended for channel ${channelID}.`);
        activeSyncs.delete(channelID);
    }
}

async function fetchAllTweets(context, initialCount = 1) {
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

        let totalSaved = 0;
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
                .setDescription(`Building a tweet index for <#${channelID}>.\n\n**New Tweets Saved:** 🐦 **${totalSaved.toLocaleString()}**\n**Active Workers:** ⚙️ ${activeWorkers}/${numWorkers}`);

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
                    await crawlAndStreamTweets(channel, endId, segmentStart, (count) => {
                        totalSaved += count;
                    });
                } finally {
                    activeWorkers--;
                }
            })());
        }

        await Promise.all(workerPromises);
        clearInterval(progressInterval);

        const tweets = db.getRandomTweets(channelID, initialCount);
        if (tweets.length > 0) {
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Super-Tweet-Crawl Complete")
                .setDescription(`Finished indexing **${totalSaved.toLocaleString()}** unique tweets in <#${channelID}>!`);
            
            if (message && message.edit) await message.edit({ embeds: [successEmbed] });
            else await sendResponse(context, { embeds: [successEmbed] });

            const refreshedTweets = await Promise.all(tweets.map(t => refreshTweetContent(context, channelID, t)));
            await deliverTweets(context, channelID, refreshedTweets);
        } else {
            sendResponse(context, "I couldn't find any tweets in this channel!");
        }
    } catch (err) {
        console.error(err);
    }
}

async function crawlAndStreamTweets(channel, beforeId, untilTimestamp, onBatchSaved) {
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
            const inserted = db.saveTweets(channel.id, localBatch);
            onBatchSaved(inserted);
            localBatch = [];
        }

        if (reachedBoundary) break;
        currentBefore = messages.lastKey();
    }

    if (localBatch.length > 0) {
        const inserted = db.saveTweets(channel.id, localBatch);
        onBatchSaved(inserted);
    }
}
