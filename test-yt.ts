import { Innertube, UniversalCache } from 'youtubei.js';

async function test() {
    const yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
    });
    
    const videoId = 'Od8BdKuZu6E';
    
    const clients = ['ANDROID', 'IOS', 'TV_EMBEDDED', 'WEB', 'YTMUSIC'];
    
    for (const client of clients) {
        console.log(`\nTesting client: ${client}`);
        try {
            const info = await yt.getInfo(videoId, { client: client as any });
            const format = info.chooseFormat({ type: 'audio', quality: 'best' });
            if (!format || !format.url) {
                console.log(`  No format URL`);
                continue;
            }
            console.log(`  Format found: ${format.itag}`);
            
            const res = await fetch(format.url, { method: 'HEAD' });
            console.log(`  HEAD status: ${res.status}`);
            if (res.status === 403) {
                const res2 = await fetch(format.url, { 
                    method: 'HEAD',
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                console.log(`  HEAD (with UA) status: ${res2.status}`);
            }
            
            try {
                const stream = await yt.download(videoId, { type: 'audio', quality: 'best', client: client as any });
                const reader = stream.getReader();
                const chunk = await reader.read();
                console.log(`  yt.download success! Chunk size: ${chunk.value?.length}`);
            } catch (e: any) {
                console.log(`  yt.download failed: ${e.message}`);
            }
            
        } catch (e: any) {
            console.log(`  Failed to get info: ${e.message}`);
        }
    }
}
test().catch(console.error);