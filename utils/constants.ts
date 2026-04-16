export const BASED_ERRORS = [
    "Something went wrong, but we're still based.",
    "The code is tripping but the bot is still dripping.",
    "Error 404: Skill not found. Just kidding, the bot is fine.",
    "The bot took a hit, but it's built different. Still standing.",
    "A minor setback for a major comeback. Bot's still up.",
    "Logic failed, but the vibe remains untouched."
];

export function getBasedError() {
    return BASED_ERRORS[Math.floor(Math.random() * BASED_ERRORS.length)];
}
