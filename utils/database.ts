import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize tables with MULTI-IMAGE support and Error Logging
db.exec(`
    CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        author TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, message_id, url)
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

    CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        stack_trace TEXT,
        method TEXT,
        user_id TEXT,
        guild_id TEXT,
        channel_id TEXT,
        additional_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Migration: Ensure existing images table supports multiple attachments per message
const imagesSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='images'").get() as { sql: string };
if (imagesSchema && !imagesSchema.sql.includes('UNIQUE(channel_id, message_id, url)')) {
    console.log("[DB] Upgrading images table to support multiple attachments per message...");
    db.transaction(() => {
        db.exec(`
            ALTER TABLE images RENAME TO images_old;
            CREATE TABLE images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                message_id TEXT,
                author TEXT NOT NULL,
                url TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(channel_id, message_id, url)
            );
            INSERT OR IGNORE INTO images (channel_id, message_id, author, url, created_at) 
            SELECT channel_id, message_id, author, url, created_at FROM images_old;
            DROP TABLE images_old;
        `);
    })();
}

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

export interface ErrorLogContext {
    method?: string;
    user_id?: string;
    guild_id?: string;
    channel_id?: string;
    additional_info?: any;
}

/**
 * Standardized error logging to the database.
 */
export function logError(error: any, context: ErrorLogContext = {}) {
    let message = 'Unknown Error';
    let stack = '';

    if (error instanceof Error) {
        message = error.message;
        stack = error.stack || '';
    } else if (typeof error === 'object' && error !== null) {
        message = error.message || (typeof error.toString === 'function' ? error.toString() : JSON.stringify(error));
        stack = error.stack || '';
    } else {
        message = String(error);
    }

    // Fallback: If no stack trace was found on the error itself, 
    // capture the current execution stack to see where the logger was triggered.
    if (!stack) {
        stack = new Error(`Fallback Stack for: ${message}`).stack || '';
    }

    const additionalInfo = context.additional_info ? JSON.stringify(context.additional_info) : null;

    try {
        db.prepare(`
            INSERT INTO error_logs (message, stack_trace, method, user_id, guild_id, channel_id, additional_info)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            message,
            stack,
            context.method || 'Unknown',
            context.user_id || null,
            context.guild_id || null,
            context.channel_id || null,
            additionalInfo
        );
        console.error(`[DB Error Logged] ${context.method || 'Unknown'}: ${message}`);
    } catch (logErr) {
        console.error("[CRITICAL DB LOG ERROR]", logErr);
        console.error("[Original Error]", error);
    }
}

export function saveImages(channelId: string, images: { author: string, url: string, message_id?: string }[]): number {
    const insert = db.prepare('INSERT OR IGNORE INTO images (channel_id, author, url, message_id) VALUES (?, ?, ?, ?)');
    let totalChanges = 0;
    const insertMany = db.transaction((imgs) => {
        for (const img of imgs) {
            const result = insert.run(channelId, img.author, img.url, img.message_id || null);
            totalChanges += result.changes;
        }
    });

    insertMany(images);
    return totalChanges;
}

export function getLastImageId(channelId: string): string | undefined {
    const result = db.prepare('SELECT message_id FROM images WHERE channel_id = ? AND message_id IS NOT NULL ORDER BY LENGTH(message_id) DESC, message_id DESC LIMIT 1').get(channelId) as { message_id: string };
    return result ? result.message_id : undefined;
}

export function getRandomImage(channelId: string): ImageRecord | undefined {
    const countResult = db.prepare('SELECT count(*) as count FROM images WHERE channel_id = ?').get(channelId) as { count: number };
    if (countResult.count === 0) return undefined;
    
    const randomOffset = Math.floor(Math.random() * countResult.count);
    return db.prepare('SELECT * FROM images WHERE channel_id = ? LIMIT 1 OFFSET ?').get(channelId, randomOffset) as ImageRecord | undefined;
}

export function getRandomImages(channelId: string, count: number): ImageRecord[] {
    const ids = db.prepare('SELECT id FROM images WHERE channel_id = ?').all(channelId) as { id: number }[];
    if (ids.length === 0) return [];
    
    // Shuffle ids
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    
    const selectedIds = ids.slice(0, count).map(row => row.id);
    const placeholders = selectedIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`).all(...selectedIds) as ImageRecord[];
}

export function clearChannelImages(channelId: string) {
    db.prepare('DELETE FROM images WHERE channel_id = ?').run(channelId);
}

export function hasImages(channelId: string): boolean {
    const result = db.prepare('SELECT count(*) as count FROM images WHERE channel_id = ?').get(channelId) as { count: number };
    return result.count > 0;
}

export function updateImageUrl(id: number, newUrl: string) {
    db.prepare('UPDATE images SET url = ? WHERE id = ?').run(newUrl, id);
}

export function updateTweetContent(id: number, newContent: string) {
    db.prepare('UPDATE tweets SET content = ? WHERE id = ?').run(newContent, id);
}

export function saveTweets(channelId: string, tweets: { author: string, content: string, message_id?: string }[]): number {
    const insert = db.prepare('INSERT OR IGNORE INTO tweets (channel_id, author, content, message_id) VALUES (?, ?, ?, ?)');
    let totalChanges = 0;
    const insertMany = db.transaction((tws) => {
        for (const tweet of tws) {
            const result = insert.run(channelId, tweet.author, tweet.content, tweet.message_id || null);
            totalChanges += result.changes;
        }
    });

    insertMany(tweets);
    return totalChanges;
}

export function getLastTweetId(channelId: string): string | undefined {
    const result = db.prepare('SELECT message_id FROM tweets WHERE channel_id = ? AND message_id IS NOT NULL ORDER BY LENGTH(message_id) DESC, message_id DESC LIMIT 1').get(channelId) as { message_id: string };
    return result ? result.message_id : undefined;
}

export function getRandomTweet(channelId: string): TweetRecord | undefined {
    const countResult = db.prepare('SELECT count(*) as count FROM tweets WHERE channel_id = ?').get(channelId) as { count: number };
    if (countResult.count === 0) return undefined;
    
    const randomOffset = Math.floor(Math.random() * countResult.count);
    return db.prepare('SELECT * FROM tweets WHERE channel_id = ? LIMIT 1 OFFSET ?').get(channelId, randomOffset) as TweetRecord | undefined;
}

export function getRandomTweets(channelId: string, count: number): TweetRecord[] {
    const ids = db.prepare('SELECT id FROM tweets WHERE channel_id = ?').all(channelId) as { id: number }[];
    if (ids.length === 0) return [];
    
    // Shuffle ids
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    
    const selectedIds = ids.slice(0, count).map(row => row.id);
    const placeholders = selectedIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM tweets WHERE id IN (${placeholders})`).all(...selectedIds) as TweetRecord[];
}

export function clearChannelTweets(channelId: string) {
    db.prepare('DELETE FROM tweets WHERE channel_id = ?').run(channelId);
}

export function hasTweets(channelId: string): boolean {
    const result = db.prepare('SELECT count(*) as count FROM tweets WHERE channel_id = ?').get(channelId) as { count: number };
    return result.count > 0;
}

export default db;
