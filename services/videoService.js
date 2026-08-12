import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const BASE_VIDEO = path.join(__dirname, '..', 'assets', 'videos', 'base_draw.mp4');
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'videos', 'generated');

// Time (in seconds) when the winner number should appear on screen
// 00:06:01 was given → interpreted as 6 seconds and 1 frame ≈ 6.04s
const NUMBER_APPEAR_TIME = 6.04;
const NUMBER_DURATION    = 5;    // seconds the number stays visible
const NAME_APPEAR_TIME   = 10;   // seconds when winner name appears
const NAME_DURATION      = 5;    // seconds the name stays visible

/**
 * Generates a personalized draw video by overlaying the winner number
 * and name on the base video using FFmpeg.
 *
 * @param {string} drawNumber - The winning ticket number
 * @param {string} winnerName - The winner's name (optional)
 * @returns {Promise<string>} - The URL path to the generated video
 */
export async function generateDrawVideo(drawNumber, winnerName) {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    if (!fs.existsSync(BASE_VIDEO)) {
        console.error('Base video not found at:', BASE_VIDEO);
        throw new Error('Base draw video not found');
    }

    const outputFilename = `draw_${drawNumber}_${Date.now()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    // ─────────────────────────────────────────────
    // Build FFmpeg filter complex
    //
    // Layer 1: Number overlay (large golden text centered)
    // Layer 2: "NÚMERO SORTEADO" label above the number
    // Layer 3: Winner name (smaller, below number)
    // ─────────────────────────────────────────────

    const fontPath = 'C\\:/Windows/Fonts/arial.ttf';

    const numberFilter = [
        // Semi-transparent dark background panel behind the number
        `[0:v]drawbox=x=(iw-600)/2:y=(ih/2-180):w=600:h=220:color=black@0.55:t=fill:enable='between(t,${NUMBER_APPEAR_TIME},${NUMBER_APPEAR_TIME + NUMBER_DURATION})'[bg]`,

        // "NÚMERO SORTEADO" label
        `[bg]drawtext=fontfile='${fontPath}':text='NÚMERO SORTEADO':fontcolor=gold:fontsize=42:x=(w-text_w)/2:y=h/2-155:enable='between(t,${NUMBER_APPEAR_TIME},${NUMBER_APPEAR_TIME + NUMBER_DURATION})'[label]`,

        // The winning number — large, bold, centered
        `[label]drawtext=fontfile='${fontPath}':text='${drawNumber}':fontcolor=white:fontsize=110:x=(w-text_w)/2:y=h/2-90:enable='between(t,${NUMBER_APPEAR_TIME},${NUMBER_APPEAR_TIME + NUMBER_DURATION})'[numtext]`,
    ];

    let finalFilter = numberFilter.join(',\n');
    let finalLabel = 'numtext';

    // Add winner name layer if provided
    if (winnerName && winnerName.trim()) {
        const safeName = winnerName.replace(/'/g, "\\'").replace(/:/g, "\\:").substring(0, 30);
        finalFilter += `,\n[${finalLabel}]drawbox=x=(iw-700)/2:y=(ih/2+50):w=700:h=90:color=black@0.50:t=fill:enable='between(t,${NAME_APPEAR_TIME},${NAME_APPEAR_TIME + NAME_DURATION})'[bg2]`;
        finalFilter += `,\n[bg2]drawtext=fontfile='${fontPath}':text='Parabéns, ${safeName}!':fontcolor=gold:fontsize=48:x=(w-text_w)/2:y=h/2+60:enable='between(t,${NAME_APPEAR_TIME},${NAME_APPEAR_TIME + NAME_DURATION})'[final]`;
        finalLabel = 'final';
    }

    const ffmpegCmd = [
        'ffmpeg -y',
        `-i "${BASE_VIDEO}"`,
        `-filter_complex "${finalFilter}"`,
        `-map "[${finalLabel}]" -map 0:a?`,
        '-c:v libx264 -crf 20 -preset fast',
        '-c:a aac -b:a 192k',
        `-t 30`,  // limit to 30s max to avoid huge files
        `"${outputPath}"`
    ].join(' ');

    console.log('=== Generating video with FFmpeg ===');
    console.log('Winner number:', drawNumber);
    console.log('Winner name:', winnerName);
    console.log('Output:', outputPath);

    try {
        const { stdout, stderr } = await execAsync(ffmpegCmd, { timeout: 120000 });
        console.log('FFmpeg completed successfully');
    } catch (error) {
        console.error('FFmpeg error:', error.message);
        throw error;
    }

    // Return relative URL path served by Express
    return `/generated-videos/${outputFilename}`;
}
