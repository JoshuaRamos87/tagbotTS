import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { sendResponse } from '../utils/response.js';

interface GelbooruTag {
    id: number;
    name: string;
    count: number;
    type: number;
}

interface GelbooruPost {
    id: number;
    file_url: string;
    source: string;
    score: number;
    rating: string;
    tags: string;
}

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused();
    if (!focusedValue || focusedValue.length < 2) {
        return interaction.respond([]);
    }

    try {
        let url = `https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&name_pattern=%${encodeURIComponent(focusedValue)}%&limit=25&orderby=count`;
        
        const apiKey = process.env.GELBOORU_API_KEY;
        const userId = process.env.GELBOORU_USER_ID;
        if (apiKey && userId) {
            url += `&api_key=${apiKey}&user_id=${userId}`;
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': BROWSER_USER_AGENT
            }
        });
        
        if (!response.ok) {
            console.error(`[Gelbooru API Error] Status: ${response.status} ${response.statusText}`);
            throw new Error('Gelbooru API error');
        }
        
        const data = await response.json() as { tag: GelbooruTag[] } | any;
        const tags = Array.isArray(data.tag) ? data.tag : (data.tag ? [data.tag] : []);

        const choices = tags.map((tag: GelbooruTag) => ({
            name: `${tag.name} (${tag.count.toLocaleString()})`,
            value: tag.name
        }));

        await interaction.respond(choices);
    } catch (error) {
        console.error('[Autocomplete Fetch Error]', error);
        await interaction.respond([]);
    }
}

export async function findac(interaction: ChatInputCommandInteraction) {
    const tags: string[] = [];
    
    // Collect all provided tags
    for (let i = 1; i <= 10; i++) {
        const t = interaction.options.getString(`tag${i}`);
        if (t) tags.push(t.trim());
    }

    const tagQuery = tags.join(' ');

    await interaction.deferReply();

    try {
        let url = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tagQuery)}&limit=100`;
        
        const apiKey = process.env.GELBOORU_API_KEY;
        const userId = process.env.GELBOORU_USER_ID;
        if (apiKey && userId) {
            url += `&api_key=${apiKey}&user_id=${userId}`;
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': BROWSER_USER_AGENT
            }
        });
        
        if (!response.ok) {
            console.error(`[Gelbooru API Error] Status: ${response.status} ${response.statusText}`);
            throw new Error('Gelbooru API error');
        }
        
        const data = await response.json() as { post: GelbooruPost[] } | any;
        const posts = Array.isArray(data.post) ? data.post : (data.post ? [data.post] : []);

        if (posts.length === 0) {
            return sendResponse(interaction, `❌ No images found for tags: \`${tagQuery}\``);
        }

        const randomPost = posts[Math.floor(Math.random() * posts.length)];
        
        const ensureProtocol = (url: string | undefined) => {
            if (!url) return '';
            if (url.startsWith('//')) return 'https:' + url;
            return url;
        };

        const fileUrl = ensureProtocol(randomPost.file_url);

        const embed = new EmbedBuilder()
            .setTitle(`Gelbooru Search: ${tags.slice(0, 3).join(', ')}${tags.length > 3 ? '...' : ''}`)
            .setURL(`https://gelbooru.com/index.php?page=post&s=view&id=${randomPost.id}`)
            .setDescription(`**Tags:** ${tags.join(', ')}\n\n[Original Image](${fileUrl})`)
            .setThumbnail(fileUrl)
            .addFields(
                { name: 'Score', value: randomPost.score.toString(), inline: true },
                { name: 'Rating', value: (randomPost.rating || 'N/A').toUpperCase(), inline: true },
                { name: 'Post ID', value: randomPost.id.toString(), inline: true }
            )
            .setColor(0x0099FF)
            .setFooter({ text: 'Powered by Gelbooru' });

        await sendResponse(interaction, { content: '', embeds: [embed] });
    } catch (error) {
        console.error('[FindAC Error]', error);
        await sendResponse(interaction, `❌ **Something went wrong while fetching the image.**`);
    }
}
