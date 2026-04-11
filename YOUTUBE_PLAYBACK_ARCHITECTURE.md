# YouTube Audio Playback Architecture

This document details the architecture and mechanisms used for streaming YouTube audio within tagbotTS, specifically addressing the challenges of bypassing YouTube's aggressive bot detection (403 Forbidden errors).

## The Challenge: YouTube's Anti-Bot Measures
Historically, Discord bots relied on pure Node.js libraries (like `ytdl-core` or `play-dl`) to fetch audio streams from YouTube. Recently, YouTube has aggressively blocked these requests:
1.  **Cipher Signatures:** YouTube encrypts video URLs. If a script cannot accurately reverse-engineer the JavaScript cipher function (which changes frequently), the resulting URL is invalid (`ERR_INVALID_URL`).
2.  **IP/Client Blocking:** Even if a valid URL is deciphered, YouTube's content servers (`googlevideo.com`) inspect the incoming request. If the request lacks valid browser headers, cookies, or originates from a known datacenter IP without passing a PoToken challenge, the server responds with an HTTP `403 Forbidden` error.

## The Solution: A Hybrid Streaming Approach
To guarantee stable, high-quality audio playback, tagbotTS implements a "Hybrid" approach that separates **Metadata Retrieval** from **Audio Streaming**.

### Step 1: Metadata Retrieval (`youtubei.js` / Innertube)
Before we can play anything, we need to ensure the requested video exists and get its proper title.
-   **Library:** `youtubei.js`
-   **Mechanism:** This library interacts with YouTube's internal API (Innertube). It is highly resilient because it can emulate different client types (like Android, iOS, or Web) to fetch basic metadata without actually requesting the heavy audio chunks.
-   **Execution in tagbotTS:**
    -   The bot takes the user's URL or Search Query.
    -   It extracts the 11-character Video ID using a robust Regex to fix common typos (e.g., `watchv=`).
    -   It calls `Innertube.getBasicInfo(videoId)` or `Innertube.search()` to retrieve the video's title and confirm its availability.

### Step 2: Binary Audio Streaming (`youtube-dl-exec` / `yt-dlp`)
Once the video is verified, we need to download the audio stream. Since Node.js native fetch methods are heavily blocked, we hand this task off to an external binary.
-   **Library:** `youtube-dl-exec` (which acts as a Node.js wrapper for the `yt-dlp` binary).
-   **Mechanism:** `yt-dlp` is a constantly maintained, standalone executable written in Python. It possesses advanced techniques for bypassing bot protection, extracting ciphers, and handling complex server handshakes that are difficult to replicate in pure Node.js.
-   **Execution in tagbotTS:**
    -   The bot spawns a child process executing `yt-dlp` with the target YouTube URL.
    -   **Flags Used:**
        -   `format: 'bestaudio'`: Instructs `yt-dlp` to only download the highest quality audio track, saving bandwidth and processing power.
        -   `output: '-'`: Crucially, this tells `yt-dlp` to stream the downloaded audio data directly to standard output (`stdout`) rather than saving it to a file on the disk.
    -   The Node.js process captures this `stdout` as a continuous `Readable` stream.

### Step 3: Discord Voice Integration (`@discordjs/voice`)
Finally, the raw audio stream must be delivered to the Discord voice channel.
-   **Library:** `@discordjs/voice`
-   **Mechanism:** Discord requires audio to be encoded in the Opus format and encrypted before being sent over UDP.
-   **Execution in tagbotTS:**
    -   The bot joins the user's voice channel, establishing a `VoiceConnection`.
    -   It waits for the connection to reach the `Ready` state.
    -   The `Readable` stream from `yt-dlp`'s `stdout` is passed into `createAudioResource()`.
    -   Behind the scenes, `@discordjs/voice` uses `ffmpeg` (provided by `ffmpeg-static`) to transcode the raw incoming audio into the necessary Opus format on-the-fly.
    -   The `AudioPlayer` consumes this resource and transmits it to the channel.

## Summary Flowchart
1. User types `/play <URL>`.
2. Bot extracts Video ID.
3. `youtubei.js` verifies the ID and fetches the Title.
4. Bot spawns `yt-dlp` requesting `bestaudio` streamed to `stdout`.
5. Bot captures `stdout` as a Node stream.
6. `@discordjs/voice` takes the Node stream, transcodes it via `ffmpeg`, and plays it in Discord.