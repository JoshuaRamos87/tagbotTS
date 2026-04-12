
import { BotContext } from '../utils/types.js';
import { sendResponse } from '../utils/response.js';

export function askDolphin(context: BotContext, userPrompt: string) {
    console.log(`User prompt: ${userPrompt}`);

    // Send the prompt to Ollama
    fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'dolphin-mixtral:8x7b',
            prompt: String(userPrompt),
            stream: false
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.response) {
            sendResponse(context, data.response); // Send Ollama's response back to Discord
        } else {
            sendResponse(context, "Error: No response from Ollama.");
        }
    })
    .catch(error => {
        console.error("Error fetching from Ollama:", error);
        sendResponse(context, "Error communicating with Ollama.");
    });
}
