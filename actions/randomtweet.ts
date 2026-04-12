import fs from 'fs';
import path from 'path';
import { SnowflakeUtil, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextBasedChannel, Message } from 'discord.js';
import * as db from '../utils/database.js';
import { BotContext } from '../utils/types.js';

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

export async function getTweet(context: BotContext, count = 1) {
    if (!context.channel) return;
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
            syncNewTweets(context, channelID, lastId).catch((err: any) => console.error("Tweet sync error:", err.message));
        }
    } else {
        await fetchAllTweets(context, count);
    }
}

async function refreshTweetContent(context: BotContext, channelID: string, tweet: db.TweetRecord) {
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
                        const channel = await context.client.channels.fetch(channelID) as TextBasedChannel;
                        const message = await channel.messages.fetch(tweet.message_id);
                        db.updateTweetContent(tweet.id, message.content);
                        return { ...tweet, content: message.content };
                    }
                }
            }
        }
    } catch (err: any) {
        console.error(`Failed to refresh tweet message ${tweet.message_id}:`, err.message);
    }
    return tweet;
}

async function deliverTweets(context: BotContext, channelID: string, tweets: db.TweetRecord[]) {
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

async function sendResponse(context: BotContext, content: any) {
    const createdTimestamp = (context as any).createdTimestamp;
    const isExpired = createdTimestamp && (Date.now() - createdTimestamp > 14 * 60 * 1000);

    if ('reply' in context && !isExpired) {
        try {
            const interaction = context as any;
            if (interaction.deferred && !interaction.replied) {
                return await interaction.editReply(content);
            }
            if (interaction.replied || interaction.deferred) {
                return await interaction.followUp(content);
            }
            return await interaction.reply(content);
        } catch (err: any) {
            console.error("Interaction response failed, falling back to channel send:", err.message);
        }
    }
    
    if (context.channel) {
        return await (context.channel as any).send(content);
    }
}

async function syncNewTweets(context: BotContext, channelID: string, lastId: string) {
    if (activeSyncs.has(channelID)) return;
    activeSyncs.add(channelID);

    try {
        console.log(`[SYNC] Starting background tweet sync for channel ${channelID} after message ${lastId}...`);
        const channel = await context.client.channels.fetch(channelID) as TextBasedChannel;
        let newTweets: { author: string, content: string, message_id: string }[] = [];
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
            currentAfter = messages.lastKey() as string;

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
    } catch (err: any) {
        console.error(`[SYNC] Tweet sync error for ${channelID}:`, err.message);
    } finally {
        console.log(`[SYNC] Background process ended for channel ${channelID}.`);
        activeSyncs.delete(channelID);
    }
}

async function fetchAllTweets(context: BotContext, initialCount = 1) {
    try {
        if (!context.channel) return;
        let channelID = context.channel.id;
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
            .setColor(0x1DA1F2)
            .setTitle("🐦 Super-Tweet-Crawler Active")
            .setDescription(`Scanning <#${channelID}> for twitter links.\n\n**Workers:** ⚙️ Starting ${numWorkers} parallel crawlers...`);

        const response = await sendResponse(context, { embeds: [initialEmbed] });
        const message = response instanceof Message ? response : null;

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
                    await crawlAndStreamTweets(channel as TextBasedChannel, endId, segmentStart, (count: number) => {
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

async function crawlAndStreamTweets(channel: TextBasedChannel, beforeId: string, untilTimestamp: number, onBatchSaved: (count: number) => void) {
    let currentBefore = beforeId;
    let localBatch: { author: string, content: string, message_id: string }[] = [];

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
        currentBefore = messages.lastKey() as string;
    }

    if (localBatch.length > 0) {
        const inserted = db.saveTweets(channel.id, localBatch);
        onBatchSaved(inserted);
    }
}
