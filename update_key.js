import fs from "fs";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const API_KEY_1 = process.env.API_KEY_1;
const API_KEY_2 = process.env.API_KEY_2;
const BASE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOperation(operation, name) {
  let lastError;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${i + 1}/${MAX_RETRIES} failed for ${name}: ${error.message}`);
      if (i < MAX_RETRIES - 1) await sleep(RETRY_DELAY);
    }
  }
  throw lastError;
}

async function generateContent(prompt, API_KEY) {
  if (!API_KEY) throw new Error("API Key is missing!");

  return retryOperation(async () => {
    const response = await axios.post(`${BASE_API_URL}?key=${API_KEY}`, {
      contents: [{ parts: [{ text: prompt }] }],
    });

    const candidate = response.data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      throw new Error("Invalid response structure from AI API");
    }

    return candidate.content.parts[0].text.trim();
  }, "AI Generation");
}

function normalizeKey(key) {
  if (typeof key !== 'string') return null;
  key = key.trim();

  // Case 1: Already 64-char Hex
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return key;
  }

  // Case 2: Base64 string (try to buffer decode)
  // Common Base64 regex
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
    try {
      const buffer = Buffer.from(key, 'base64');
      const hex = buffer.toString('hex');
      if (hex.length === 64) return hex;
    } catch (e) { }
  }

  // Case 3: Hex encoded string (e.g. AI returned hex of the string "key")
  if (/^[0-9a-fA-F]+$/.test(key)) {
    try {
      // Try decoding hex to string, maybe that string is the key?
      const buffer = Buffer.from(key, 'hex');
      const str = buffer.toString('utf8');
      if (/^[0-9a-fA-F]{64}$/.test(str)) return str;
    } catch (e) { }
  }

  return null;
}

async function processSite(url, siteName, outputFile, API_KEY) {
  const uniqueId = Math.random().toString(36).substring(7);
  const tempInput = `input_${uniqueId}.txt`;
  const tempOutput = `output_${uniqueId}.js`;

  console.log(`[${siteName}] Starting process for ${url}`);

  try {
    // Fetch Script
    await retryOperation(async () => {
      const response = await axios.get(url);
      await writeFileAsync(tempInput, response.data, "utf8");
    }, `Fetch ${siteName}`);
    console.log(`[${siteName}] Script fetched.`);

    // Deobfuscate
    console.log(`[${siteName}] Running deobfuscate...`);
    try {
      await execAsync(`node deobfuscate.js ${tempInput} ${tempOutput}`);
    } catch (error) {
      console.error(`[${siteName}] Deobfuscation failed:`, error.stderr || error.message);
      throw error;
    }
    console.log(`[${siteName}] Deobfuscation complete.`);

    // Read result
    const data = await fs.promises.readFile(tempOutput, "utf8");

    // Extract logic
    // This regex looks for the IIFE structure often used in these obfuscations
    const match = data.match(/\(\(\)\s*=>\s*\{([\s\S]*?)try\s*{/);
    if (!match) {
      throw new Error(`[${siteName}] Could not find matching obfuscated pattern in output.`);
    }

    const xor_value_regex = /\b([a-zA-Z_$][\w$]*)\s*=\s*(?!0\b)(\d+)\s*;/g;
    let xor_value;
    const xorMatch = match[0].match(xor_value_regex);
    if (xorMatch) {
      xor_value = xorMatch[0];
    }

    let extra_message = "Decode the following obfuscated script. Extract and retain ONLY the relevant code that directly generates the 64-bit secret key. Remove all irrelevant, unused, dead code, or undefined variables. Output CLEAN, WORKING JavaScript only. The last statement should be 'return variableName;' where variableName holds the final string key. Do NOT wrap it in a function. Do NOT use console.log. IMPORTANT: The final key MUST be a 64-character HEXADECIMAL string. If the extracted logic produces Base64, you MUST add code to convert it to Hex.";

    if (xor_value) {
      extra_message += ` Note: We detected ${xor_value} in the context. If this variable is used for XOR operations in key mappings, ensure the logic includes it properly or simplifies it.`;
    }

    const prompt = `${match[0]}\n\n/* ${extra_message} */`;

    console.log(`[${siteName}] Requesting AI analysis...`);
    const decoded_code = await generateContent(prompt, API_KEY);

    if (!decoded_code) throw new Error(`[${siteName}] AI returned empty response.`);

    // Clean up markdown code blocks if present
    const cleanCode = decoded_code.replace(/^```(javascript|js)?/gm, '').replace(/^```/gm, '').trim();

    let finalCodeToRun = cleanCode;
    if (finalCodeToRun.includes("console.log")) {
      finalCodeToRun = finalCodeToRun.replace(/console\.log/g, "return");
    }

    // Execute the code safely
    console.log(`[${siteName}] Executing generated code...`);
    let finalKey;
    try {
      finalKey = new Function(finalCodeToRun)();
    } catch (e) {
      console.error(`[${siteName}] Execution error of generated code:\n${finalCodeToRun}\n`);
      throw new Error(`Execution failed: ${e.message}`);
    }

    console.log(`[${siteName}] Result:`, finalKey);

    const normalized = normalizeKey(finalKey);
    if (normalized) {
      await writeFileAsync(outputFile, normalized, "utf8");
      console.log(`[${siteName}] SUCCESS! Key written to ${outputFile}`);
    } else {
      console.error(`[${siteName}] Generated key is Invalid (Not 64-char hex): ${finalKey}`);
    }

  } catch (error) {
    console.error(`[${siteName}] FAILED:`, error.message);
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(tempInput)) await unlinkAsync(tempInput);
      if (fs.existsSync(tempOutput)) await unlinkAsync(tempOutput);
    } catch (e) { console.error(`[${siteName}] Cleanup warning:`, e.message); }
  }
}

async function main() {
  if (!API_KEY_1 || !API_KEY_2) {
    console.warn("WARNING: API Keys (API_KEY_1 or API_KEY_2) are missing from environment variables.");
  }

  const tasks = [
    processSite(
      "https://megacloud.blog/js/player/a/v2/pro/embed-1.min.js?v=" + Date.now(),
      "MegaCloud",
      "key.txt",
      API_KEY_1
    ),
    processSite(
      "https://cloudvidz.net/js/player/m/v2/pro/embed-1.min.js?v=" + Date.now(),
      "CloudVidz",
      "rabbit.txt",
      API_KEY_2
    )
  ];

  await Promise.allSettled(tasks);
  console.log("All tasks completed.");
}

main().catch(console.error);
