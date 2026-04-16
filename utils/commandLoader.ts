import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection } from "discord.js";
import { pathToFileURL } from 'node:url';

/**
 * Dynamically loads all command files into the client.
 * It automatically detects if it should load .ts (source) or .js (build) files
 * based on the execution context.
 */
export async function loadCommands(client: Client) {
    client.commands = new Collection();
    
    // Calculate path relative to this file's location (works for both src and build)
    // commandLoader is in /utils, so commands are at ../commands
    const commandsPath = path.join(import.meta.dirname, '..', 'commands');
    
    if (!fs.existsSync(commandsPath)) {
        console.error(`[Loader] Commands directory not found at: ${commandsPath}`);
        return;
    }

    // Filter for the appropriate extension based on how the bot was started
    const isTypeScript = import.meta.url.endsWith('.ts');
    const extension = isTypeScript ? '.ts' : '.js';

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(extension));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = await import(pathToFileURL(filePath).href);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        } catch (err) {
            console.error(`[Loader] Failed to load command at ${filePath}:`, err);
        }
    }
    
    console.log(`[Loader] Successfully loaded ${client.commands.size} commands.`);
}
