import ytdl from 'youtube-dl-exec';
import { Readable } from 'stream';

async function test() {
    const url = 'https://www.youtube.com/watch?v=Od8BdKuZu6E';
    
    console.log('Testing yt-dlp...');
    
    const ytDlpProcess = ytdl.exec(url, {
        output: '-',
        format: 'bestaudio',
    }, { stdio: ['ignore', 'pipe', 'ignore'] });
    
    const stream = ytDlpProcess.stdout as Readable;
    
    let bytes = 0;
    stream.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 100) {
            console.log(`Successfully received ${bytes} bytes from yt-dlp!`);
            ytDlpProcess.kill();
            process.exit(0);
        }
    });
    
    stream.on('error', err => {
        console.error('Stream error:', err.message);
    });

    ytDlpProcess.on('close', code => {
        console.log('Process exited with code:', code);
    });
}

test().catch(console.error);