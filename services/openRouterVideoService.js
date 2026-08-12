

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_VIDEO_MODEL = process.env.OPENROUTER_VIDEO_MODEL || 'luma/dream-machine';

/**
 * Creates the dynamic prompt based on the winning number and name.
 */
function createPrompt(drawNumber, winnerName) {
    let prompt = `Create a highly realistic premium Brazilian lottery draw television broadcast.

A beautiful adult blonde female television presenter, elegant and professionally dressed, is standing inside a luxurious modern lottery studio.

She has a charismatic, confident and friendly television-host presence.

Beside her there is a sophisticated transparent golden lottery machine containing numbered balls.

Cinematic television lighting, premium golden details, realistic skin, realistic hair, natural body movements, natural hand gestures and professional broadcast camera movement.

The lottery machine spins before the announcement.

The presenter looks directly into the camera and speaks naturally in Brazilian Portuguese:

"Olá! Chegou o momento do nosso sorteio."

After a short suspenseful pause she announces:

"O número sorteado foi ${drawNumber}!"`;

    if (winnerName) {
        prompt += `\n\nIf a winner name exists, she then says:\n\n"Parabéns, ${winnerName}!"`;
    }

    prompt += `\n\nThe winning number ${drawNumber} must also appear clearly on a premium television-style graphic on screen.

After revealing the result, golden confetti appears and the presenter celebrates naturally.

The scene must look like a real professional Brazilian television lottery broadcast.

No cartoon appearance.
No game character appearance.
No CGI-looking human.
No distorted hands.
No distorted face.
No incorrect numbers.
No subtitles unless explicitly requested.`;

    return prompt;
}

/**
 * Mocks the OpenRouter API call for video generation to avoid costs during development,
 * unless a real API key is provided and a specific real model is set.
 */
export async function generateDrawVideo(drawNumber, winnerName) {
    const prompt = createPrompt(drawNumber, winnerName);
    
    console.log("=== Generating Video with OpenRouter ===");
    console.log("Prompt:", prompt);

    if (!OPENROUTER_API_KEY) {
        console.log("No OPENROUTER_API_KEY found, simulating video generation...");
        // Simulate a job ID
        return `mock-job-${Date.now()}`;
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: OPENROUTER_VIDEO_MODEL,
                messages: [
                    { role: "user", content: prompt }
                ]
            })
        });

        if (!response.ok) {
            console.error("OpenRouter API error:", await response.text());
            throw new Error(`OpenRouter API failed with status ${response.status}`);
        }

        const data = await response.json();
        // Depending on the model, it might return a job ID or a direct URL in the content.
        // For standard async video models on OpenRouter, they often return an ID to poll.
        // If the model returns direct content, we treat it as the URL.
        const content = data.choices[0]?.message?.content;
        
        // If the content looks like a URL, it's ready immediately, but usually it's an ID for video models.
        if (content && content.startsWith('http')) {
            return { ready: true, url: content };
        }

        return data.id || `job-${Date.now()}`; 
    } catch (error) {
        console.error("Error generating video:", error);
        return null;
    }
}

/**
 * Checks the status of a video generation job.
 */
export async function checkVideoStatus(jobId) {
    if (jobId.startsWith('mock-job-')) {
        // Simulate waiting
        const age = Date.now() - parseInt(jobId.split('-')[2]);
        if (age > 20000) { // Simulate 20 seconds generation time
            return {
                status: 'ready',
                url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' // Big Buck Bunny / Tears of Steel sample
            };
        }
        return { status: 'generating' };
    }

    if (!OPENROUTER_API_KEY) {
        return { status: 'failed' };
    }

    try {
        // This endpoint might vary depending on OpenRouter's specific implementation for async video models.
        // For the sake of the plan, we assume a standard check mechanism.
        const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${jobId}`, {
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`
            }
        });
        
        if (!response.ok) return { status: 'failed' };
        
        const data = await response.json();
        
        if (data.status === 'completed') {
            return { status: 'ready', url: data.generation?.url || data.content };
        } else if (data.status === 'failed') {
            return { status: 'failed' };
        }
        
        return { status: 'generating' };
    } catch (error) {
        console.error("Error checking video status:", error);
        return { status: 'failed' };
    }
}
