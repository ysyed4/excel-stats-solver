# Excel Stats Solver

A small web app for solving continuous and discrete probability / statistics problems the same way MMA 863 (and Excel textbooks) do: by looking values up with Excel-style functions such as `BINOM.DIST`, `POISSON.DIST`, `NORM.DIST`, `NORM.S.INV`, and `T.INV`.

Every solution includes a **pedagogical walkthrough** in the course’s six-step style:

1. Determine the distribution  
2. Code what you know  
3. Identify what to find  
4. Sketch a diagram (number line / shaded density / CI bar)  
5. Translate into an Excel-computable form  
6. Solve, check reasonableness, and explain  

It does **not** ask you to plug numbers into closed-form definitional formulas (e.g. the binomial PMF).

## Features

- **Paste a problem** and autofill fields (no need to name the distribution)
- **Local detection** from an MMA practice training corpus + heuristics
- **Optional AI detection** with **Claude**, **ChatGPT (OpenAI)**, or **Gemini**
- Dark UI with a left-hand table of contents for every solver
- Discrete, continuous, and sampling / confidence-interval solvers

---

## Prerequisites

Before you start, install:

1. **Node.js** (v18 or newer recommended) — [nodejs.org](https://nodejs.org/)
2. A terminal (Terminal.app on Mac, or the integrated terminal in Cursor / VS Code)
3. *(Optional)* One developer API key if you want AI Detect — see [Set up an AI key](#set-up-an-ai-key-optional) below

> **Important:** A Claude.ai, ChatGPT, or Gemini **chat** account is **not** the same as an API key. AI Detect needs a **developer API key** from that company’s console.

---

## Quick start (no AI)

These steps get the app running with **local** problem detection only.

### 1. Open the project folder

```bash
cd ~/Projects/excel-stats-solver
```

If your copy lives somewhere else, use that path instead.

### 2. Install dependencies

```bash
npm install
```

If this fails with `no space left on device` or `ENOENT`, free disk space first (empty Trash, clear caches), then try again:

```bash
rm -rf node_modules
npm install
```

### 3. Start the development server

```bash
npm run dev
```

You should see something like:

```text
  ➜  Local:   http://localhost:5173/
```

### 4. Open the app

In your browser, go to: **http://localhost:5173/**

Keep the terminal window open while you use the app. To stop the server later, press `Ctrl+C`.

### 5. Try a problem (local detect)

1. Paste a full practice problem into **Paste a problem**
2. Click **Detect locally only** (or **Detect & autofill** — without an API key it falls back to local)
3. If you see **Part A / Part B** chips, click each part to switch setups
4. Review the filled inputs and the solution walkthrough

---

## Set up an AI key (optional)

AI Detect can use **any one** of these providers. You only need **one** key.

| Platform | Env variable | Get a key |
|----------|--------------|-----------|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| ChatGPT (OpenAI) | `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Gemini (Google) | `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

### Shared steps (everyone)

#### 1. Create the `.env` file

In a **new** terminal tab (leave `npm run dev` running in the other tab, or stop it first — you will restart later anyway):

```bash
cd ~/Projects/excel-stats-solver
cp .env.example .env
open -e .env
```

- On Mac, `open -e .env` opens the file in TextEdit.
- On Linux you can use `nano .env` or open it in your editor.
- On Windows (PowerShell): `copy .env.example .env` then open `.env` in Notepad.

#### 2. Add **your** provider’s key

Follow **only** the section for the platform you use. Leave the other keys blank.

#### 3. Save the file

Save `.env` (`⌘S` / `Ctrl+S`) and close the editor.

#### 4. Restart the app so the key loads

In the terminal where Vite is running:

1. Press `Ctrl+C` to stop it  
2. Start again:

```bash
npm run dev
```

#### 5. Use AI Detect

1. Open **http://localhost:5173/**
2. Paste a problem
3. Click **Detect & autofill**
4. The status line should mention AI (and which model/provider when available)

If the key is missing or the API fails, the app automatically falls back to **local** detection and says so in the status line.

---

### Option A — Claude (Anthropic)

1. Go to [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Sign in (create an Anthropic Console account if needed)
3. Click **Create Key**, name it (e.g. `excel-stats-solver`), and copy the key  
   - It usually starts with `sk-ant-...`
   - You may only see the full key once — store it somewhere safe
4. In your `.env` file, set:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-paste-your-real-key-here
```

Rules:

- No quotes around the key  
- No spaces around `=`  
- Do **not** use a `VITE_` prefix  

Optional model override:

```bash
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

---

### Option B — ChatGPT / OpenAI

1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in to your OpenAI **Platform** account (this is separate from chatgpt.com chat)
3. Click **Create new secret key**, copy it  
   - It usually starts with `sk-...`
4. In your `.env` file, set:

```bash
OPENAI_API_KEY=sk-paste-your-real-key-here
```

Optional model override:

```bash
OPENAI_MODEL=gpt-4o-mini
```

> You may need to add billing / credits in the OpenAI Platform billing settings before the API works.

---

### Option C — Gemini (Google)

1. Go to [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **Create API key**, copy it
4. In your `.env` file, set:

```bash
GEMINI_API_KEY=paste-your-real-key-here
```

`GOOGLE_API_KEY=...` is also accepted as an alternate name.

Optional model override:

```bash
GEMINI_MODEL=gemini-2.0-flash
```

---

### If you have more than one key

By default the app picks the first available key in this order:

1. Anthropic (`ANTHROPIC_API_KEY`)  
2. OpenAI (`OPENAI_API_KEY`)  
3. Gemini (`GEMINI_API_KEY` or `GOOGLE_API_KEY`)  

To force a specific provider, add this line to `.env`:

```bash
AI_PROVIDER=openai
```

Allowed values: `anthropic`, `openai`, or `gemini`.

Example forcing ChatGPT even if a Claude key is also present:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

---

### Example `.env` (Claude only)

```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxx
```

### Example `.env` (ChatGPT only)

```bash
OPENAI_API_KEY=sk-xxxxxxxx
```

### Example `.env` (Gemini only)

```bash
GEMINI_API_KEY=xxxxxxxx
```

---

## Using the app day to day

```bash
cd ~/Projects/excel-stats-solver
npm run dev
```

Then open **http://localhost:5173/**.

| Button | What it does |
|--------|----------------|
| **Detect & autofill** | Tries AI (if a key is configured), otherwise local detection |
| **Detect locally only** | Always uses the training corpus + heuristics (no API call) |
| **Clear** | Clears the paste box |

After detection:

- Check that the left TOC jumped to the right solver (Binomial, Poisson, etc.)
- Confirm the numeric fields look right
- Read the step-by-step walkthrough (Excel-style calls included)
- For multi-part problems, use the **Part A / Part B** chips

---

## Production build (optional)

To build a production bundle and preview it:

```bash
cd ~/Projects/excel-stats-solver
npm run build
npm run preview
```

Open the URL printed in the terminal (often **http://localhost:4173/**).

AI Detect still works in preview because the same local `/api/ai-detect` proxy is enabled — your `.env` keys are still required.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `npm install` fails / “no space left on device” | Free disk space, then `rm -rf node_modules` and `npm install` again |
| `Missing script: "dev"` | You are not in the project folder — run `cd ~/Projects/excel-stats-solver` first |
| Page won’t load | Confirm `npm run dev` is still running and use the URL it prints |
| Detect always says “local” / AI unavailable | Check `.env` has the correct variable name, key has no quotes/spaces, then **restart** `npm run dev` |
| API error / 401 | Key is wrong, revoked, or the account has no API billing/credits |
| Wrong distribution detected | Try **Detect locally only**, or edit fields manually; AI is a helper, not perfect |
| `zsh: parse error near ')'` when pasting commands | Don’t paste comment lines that contain `(...)`; paste bare commands only |

---

## Security notes

- **Never commit `.env`** (it is gitignored). Commit `.env.example` only.
- Keys use names **without** `VITE_`, so they stay on the Vite **server** middleware and are not baked into the browser JavaScript bundle.
- Use a restricted / low-spend key for local coursework.
- Do not share your API key in screenshots, chat, or GitHub issues.

---

## Stack

- Vite + React + TypeScript  
- [jStat](https://jstat.github.io/) numerical distribution routines behind Excel-named wrappers  
- Optional Claude / OpenAI / Gemini classification via Vite `/api/ai-detect` proxy  

## License

MIT
