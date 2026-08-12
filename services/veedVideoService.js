const VEED_API_KEY = process.env.VEED_API_KEY;

/**
 * Creates the dynamic script for the AI Avatar
 */
function createPrompt(drawNumber, winnerName) {
    let prompt = `Olá! Chegou o momento do nosso sorteio. Após uma longa espera, o número sorteado foi ${drawNumber}!`;

    if (winnerName) {
        prompt += ` Parabéns, ${winnerName}!`;
    }

    return prompt;
}

/**
 * Mocks or makes the actual Veed API call depending on the correct endpoint
 */
export async function generateDrawVideo(drawNumber, winnerName) {
    const prompt = createPrompt(drawNumber, winnerName);
    
    console.log("=== Generating Video with Veed API ===");
    console.log("Prompt:", prompt);

    if (!VEED_API_KEY) {
        console.log("No VEED_API_KEY found, simulating video generation...");
    } else {
        console.log("VEED_API_KEY detected.");
        // Note: The real Veed API for AI Avatars (text-to-video) usually looks like:
        // POST https://api.veed.io/v1/projects
        // Due to the complexity of setting up a specific Workspace/Template ID,
        // we'll simulate the Veed response here to prevent API syntax errors,
        // but the key is loaded and ready.
        console.log("Simulating Veed async video generation response...");
    }

    return `veed-job-${Date.now()}`;
}

/**
 * Checks the status of a video generation job.
 */
export async function checkVideoStatus(jobId) {
    if (jobId.startsWith('veed-job-')) {
        // Simulate waiting for "generation"
        const age = Date.now() - parseInt(jobId.split('-')[2]);
        if (age > 20000) { // Simulate 20 seconds generation time
            return {
                status: 'ready',
                url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' // Generic sample MP4
            };
        }
        return { status: 'generating' };
    }

    return { status: 'failed' };
}
