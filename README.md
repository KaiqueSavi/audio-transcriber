# Video Transcriber

Transcreve arquivos de vídeo/áudio para texto com timestamps usando o Whisper da OpenAI.

## Como funciona

1. Você coloca o arquivo de vídeo na pasta
2. O script converte o vídeo para mp3 comprimido via **ffmpeg** (32k mono — suficiente para voz)
3. Se o arquivo for maior que 10MB, ele é dividido em **chunks de 8 minutos** automaticamente
4. Cada chunk é enviado para a API do **Whisper (OpenAI)** separadamente
5. Os timestamps de cada chunk são ajustados para refletir o tempo real do vídeo original
6. O resultado é exibido no terminal e salvo em um arquivo `.txt`

## Requisitos

- [Node.js](https://nodejs.org) 18+
- [ffmpeg](https://ffmpeg.org) instalado no sistema
- Chave de API da OpenAI

```bash
# Instalar ffmpeg no macOS
brew install ffmpeg
```

## Setup

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de variáveis de ambiente
cp .env.example .env

# 3. Editar o .env e inserir sua chave
OPENAI_API_KEY=sk-...
```

## Uso

```bash
node transcribe.js <arquivo>
```

**Exemplos:**

```bash
node transcribe.js video.mov
node transcribe.js /Downloads/reuniao.mp4
node transcribe.js aula.m4a
```

## Formatos suportados

| Formato | Suporte |
|---------|---------|
| `.mov`  | ✅ (converte automaticamente) |
| `.mp4`  | ✅ |
| `.m4a`  | ✅ |
| `.mp3`  | ✅ |
| `.wav`  | ✅ |
| `.webm` | ✅ |
| outros  | ✅ (converte via ffmpeg) |

## Output

O script gera um arquivo `<nome-do-video>_transcricao.txt` na mesma pasta do vídeo:

```
TRANSCRIÇÃO: video.mov
Data: 17/03/2026 20:00:00
Duração total: 22:14.00

═══════════════════════════════════════
 SEGMENTOS COM TIMESTAMPS
═══════════════════════════════════════

[0:03.20 → 0:09.40]
Olá, bem-vindos à aula de hoje.

[0:10.00 → 0:18.75]
Vamos falar sobre como funciona a transcrição automática.

═══════════════════════════════════════
 TEXTO COMPLETO
═══════════════════════════════════════

Olá, bem-vindos à aula de hoje. Vamos falar sobre...
```

## Limite de tamanho

A API do Whisper aceita até **25MB por requisição**. Para contornar isso:

- O áudio é convertido para mp3 comprimido (32kbps mono), reduzindo drasticamente o tamanho
- Arquivos acima de 10MB são divididos em chunks de 8 minutos automaticamente
- Os timestamps são corrigidos para o tempo absoluto do vídeo original
- Não há limite prático de duração do vídeo

## Estrutura do projeto

```
video-transcriber/
├── transcribe.js       # script principal
├── package.json
├── .env                # sua chave da OpenAI (não comitar)
├── .env.example        # template do .env
└── .gitignore
```
