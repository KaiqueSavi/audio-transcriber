import OpenAI, { toFile } from 'openai';
import { execSync } from 'child_process';
import { existsSync, unlinkSync, statSync, readFileSync, writeFileSync } from 'fs';
import { extname, basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10 * 60 * 1000, // 10 minutos
  maxRetries: 3,
});

const SUPPORTED_FORMATS = ['.flac', '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.wav', '.webm'];
const MAX_SIZE_MB = 10; // força chunks para arquivos acima disso (evita ECONNRESET)
const CHUNK_MINUTES = 8; // duração de cada chunk em minutos

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}

function getAudioDuration(filePath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { encoding: 'utf-8' }
  );
  return parseFloat(out.trim());
}

async function convertToMp3(inputPath) {
  const tempPath = join(__dirname, `temp_${Date.now()}.mp3`);
  console.log('Convertendo para mp3 via ffmpeg...');
  // 32k mono 16kHz — suficiente para voz, Whisper não precisa de mais
  execSync(`ffmpeg -i "${inputPath}" -vn -ar 16000 -ac 1 -b:a 32k "${tempPath}" -y -loglevel error`);
  return tempPath;
}

async function transcribeChunk(filePath, offsetSeconds = 0) {
  const fileBuffer = readFileSync(filePath);
  const file = await toFile(fileBuffer, basename(filePath), { type: 'audio/mpeg' });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  // Corrige os timestamps somando o offset do chunk
  if (offsetSeconds > 0 && transcription.segments) {
    for (const seg of transcription.segments) {
      seg.start += offsetSeconds;
      seg.end += offsetSeconds;
    }
    transcription.duration = (transcription.duration ?? 0) + offsetSeconds;
  }

  return transcription;
}

async function transcribeVideo(inputPath) {
  if (!existsSync(inputPath)) {
    console.error(`Arquivo não encontrado: ${inputPath}`);
    process.exit(1);
  }

  const ext = extname(inputPath).toLowerCase();
  let audioPath = inputPath;
  let isTempFile = false;

  if (!SUPPORTED_FORMATS.includes(ext)) {
    audioPath = await convertToMp3(inputPath);
    isTempFile = true;
  }

  const fileSizeMB = statSync(audioPath).size / (1024 * 1024);

  // Arquivo cabe direto na API — sem chunking
  if (fileSizeMB <= MAX_SIZE_MB) {
    console.log(`Transcrevendo "${basename(inputPath)}" (${fileSizeMB.toFixed(1)}MB)...`);
    const result = await transcribeChunk(audioPath);
    if (isTempFile) unlinkSync(audioPath);
    return result;
  }

  // Arquivo grande — divide em chunks
  const totalDuration = getAudioDuration(audioPath);
  const chunkSecs = CHUNK_MINUTES * 60;
  const totalChunks = Math.ceil(totalDuration / chunkSecs);

  console.log(`Arquivo grande (${fileSizeMB.toFixed(1)}MB) — dividindo em ${totalChunks} chunks de ${CHUNK_MINUTES} min...`);

  const allSegments = [];
  let fullText = '';
  let chunkFiles = [];

  for (let i = 0; i < totalChunks; i++) {
    const startSec = i * chunkSecs;
    const chunkPath = join(__dirname, `temp_chunk_${Date.now()}_${i}.mp3`);
    chunkFiles.push(chunkPath);

    process.stdout.write(`  Chunk ${i + 1}/${totalChunks}... `);

    execSync(
      `ffmpeg -i "${audioPath}" -ss ${startSec} -t ${chunkSecs} -vn -ar 16000 -ac 1 -b:a 32k "${chunkPath}" -y -loglevel error`
    );

    const result = await transcribeChunk(chunkPath, startSec);
    allSegments.push(...(result.segments ?? []));
    fullText += (i > 0 ? ' ' : '') + result.text.trim();

    console.log('ok');
  }

  // Limpeza
  for (const f of chunkFiles) if (existsSync(f)) unlinkSync(f);
  if (isTempFile) unlinkSync(audioPath);

  return {
    text: fullText,
    segments: allSegments,
    duration: totalDuration,
  };
}

function buildOutput(filename, result) {
  const lines = [
    `TRANSCRIÇÃO: ${filename}`,
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    `Duração total: ${formatTime(result.duration ?? 0)}`,
    '',
    '═══════════════════════════════════════',
    ' SEGMENTOS COM TIMESTAMPS',
    '═══════════════════════════════════════',
    '',
  ];

  for (const seg of result.segments ?? []) {
    lines.push(`[${formatTime(seg.start)} → ${formatTime(seg.end)}]`);
    lines.push(seg.text.trim());
    lines.push('');
  }

  lines.push('═══════════════════════════════════════');
  lines.push(' TEXTO COMPLETO');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(result.text.trim());

  return lines.join('\n');
}

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.log('Uso: node transcribe.js <arquivo.mov>');
    console.log('Exemplo: node transcribe.js video.mov');
    process.exit(1);
  }

  const result = await transcribeVideo(inputPath);

  console.log('\n');
  for (const seg of result.segments ?? []) {
    console.log(`[${formatTime(seg.start)} → ${formatTime(seg.end)}]  ${seg.text.trim()}`);
  }

  const outputPath = inputPath.replace(/\.[^.]+$/, '_transcricao.txt');
  const content = buildOutput(basename(inputPath), result);
  writeFileSync(outputPath, content, 'utf-8');

  console.log(`\nTranscrição salva em: ${outputPath}`);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  if (err.cause) console.error('Causa:', err.cause);
  if (err.code) console.error('Código:', err.code);
  process.exit(1);
});
