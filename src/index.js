require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { loadMusicMetadata } = require("music-metadata");

/**
 * Transcribe the audio file using OpenAI's Whisper API.
 * @returns {Promise<{transcription: string, audioLength: number}>} The transcription text and audio length in minutes.
 */
async function transcribeAudio() {
  const audioPath = path.join(__dirname, "../input/memo.m4a");
  const outputDir = path.join(__dirname, "../output");
  const transcriptionPath = path.join(outputDir, "transcription.txt");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  let metadata;
  const mm = await loadMusicMetadata();
  try {
    metadata = await mm.parseFile(audioPath);
  } catch (error) {
    console.error("Error parsing audio file metadata:", error.message);
    throw error;
  }
  const audioLength = metadata.format.duration / 60; // duration in minutes

  if (fs.existsSync(transcriptionPath)) {
    console.log("Transcription file already exists. Using the existing file.");
    const transcription = fs.readFileSync(transcriptionPath, "utf-8");
    return { transcription, audioLength };
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath));
  form.append("model", "whisper-1");

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const transcription = response.data.text;
    fs.writeFileSync(transcriptionPath, transcription, "utf-8");
    console.log("Transcription saved to transcription.txt");
    return { transcription, audioLength };
  } catch (error) {
    console.error(
      "Error transcribing audio:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

/**
 * Summarize the transcription into structured thoughts using OpenAI's GPT API.
 * @param {string} transcription - The transcription text.
 * @param {string} pagesLength - The amount of A4 pages the summary should optimise for
 * @param {number} audioLength - The length of the audio file in minutes.
 * @returns {Promise<string>} The summarized thoughts in Markdown format.
 */
async function summarizeTranscription(transcription, pagesLength, audioLength) {
  const summaryPath = path.join(__dirname, "../output/thoughts.md");

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant that summarizes transcriptions into structured thoughts in Markdown format.",
      },
      {
        role: "user",
        content: `Summarize the following transcription into formatted and structured thoughts in Markdown. The summary should be succinct but expansive, and cover roughly ${pagesLength} pages of A4 for this ${audioLength} mins recording.\n\nTranscription:\n${transcription}`,
      },
    ];

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1500,
        temperature: 0.5,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const summary = response.data.choices[0].message.content.trim();
    fs.writeFileSync(summaryPath, summary, "utf-8");
    console.log("Summary saved to thoughts.md");
    return summary;
  } catch (error) {
    console.error(
      "Error summarizing transcription:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

/**
 * Main function to execute transcription and summarization.
 */
async function main() {
  try {
    const { transcription, audioLength } = await transcribeAudio();
    const pagesLength = 2;
    await summarizeTranscription(transcription, pagesLength, audioLength);
  } catch (error) {
    console.error("An error occurred during processing.");
  }
}

main();
