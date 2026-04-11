import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        author TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_images_channel_id ON images(channel_id);
    CREATE TABLE IF NOT EXISTS tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tweets_channel_id ON tweets(channel_id);
`);

export interface ImageRecord {
    id: number;
    channel_id: string;
    message_id: string;
    author: string;
    url: string;
}

export interface TweetRecord {
    id: number;
    channel_id: string;
    message_id: string;
    author: string;
    content: string;
}

export function saveImages(channelId: string, images: { author: string, url: string, message_id?: string }[]) {
    const insert = db.prepare('INSERT OR IGNORE INTO images (channel_id, author, url, message_id) VALUES (?, ?, ?, ?)');
    
    const insertMany = db.transaction((channelId: string, images: { author: string, url: string, message_id?: string }[]) => {
        for (const img of images) {
            insert.run(channelId, img.author, img.url, img.message_id || null);
        }
    });

    insertMany(channelId, images);
}

export function getLastImageId(channelId: string): string | undefined {
    const result = db.prepare('SELECT message_id FROM images WHERE channel_id = ? AND message_id IS NOT NULL ORDER BY LENGTH(message_id) DESC, message_id DESC LIMIT 1').get(channelId) as { message_id: string };
    return result ? result.message_id : undefined;
}

export function getRandomImage(channelId: string): ImageRecord | undefined {
    return db.prepare('SELECT * FROM images WHERE channel_id = ? ORDER BY RANDOM() LIMIT 1').get(channelId) as ImageRecord | undefined;
}

export function getRandomImages(channelId: string, count: number): ImageRecord[] {
    return db.prepare('SELECT * FROM images WHERE channel_id = ? ORDER BY RANDOM() LIMIT ?').all(channelId, count) as ImageRecord[];
}

export function clearChannelImages(channelId: string) {
    db.prepare('DELETE FROM images WHERE channel_id = ?').run(channelId);
}

export function hasImages(channelId: string): boolean {
    const result = db.prepare('SELECT count(*) as count FROM images WHERE channel_id = ?').get(channelId) as { count: number };
    return result.count > 0;
}

export function saveTweets(channelId: string, tweets: { author: string, content: string, message_id?: string }[]) {
    const insert = db.prepare('INSERT OR IGNORE INTO tweets (channel_id, author, content, message_id) VALUES (?, ?, ?, ?)');
    
    const insertMany = db.transaction((channelId: string, tweets: { author: string, content: string, message_id?: string }[]) => {
        for (const tweet of tweets) {
            insert.run(channelId, tweet.author, tweet.content, tweet.message_id || null);
        }
    });

    insertMany(channelId, tweets);
}

export function getLastTweetId(channelId: string): string | undefined {
    const result = db.prepare('SELECT message_id FROM tweets WHERE channel_id = ? AND message_id IS NOT NULL ORDER BY LENGTH(message_id) DESC, message_id DESC LIMIT 1').get(channelId) as { message_id: string };
    return result ? result.message_id : undefined;
}

export function getRandomTweet(channelId: string): TweetRecord | undefined {
    return db.prepare('SELECT * FROM tweets WHERE channel_id = ? ORDER BY RANDOM() LIMIT 1').get(channelId) as TweetRecord | undefined;
}

export function clearChannelTweets(channelId: string) {
    db.prepare('DELETE FROM tweets WHERE channel_id = ?').run(channelId);
}

export function hasTweets(channelId: string): boolean {
    const result = db.prepare('SELECT count(*) as count FROM tweets WHERE channel_id = ?').get(channelId) as { count: number };
    return result.count > 0;
}

export default db;
