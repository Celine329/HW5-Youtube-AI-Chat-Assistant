# YouTube AI Chat Assistant

A React chatbot powered by Google Gemini that analyzes YouTube channel data. Built for the **Generative AI and Social Media** course (HW5) at Yale School of Management. Features include YouTube channel data downloading, drag-and-drop JSON analysis, interactive charts, video playback cards, image generation, and personalized AI chat — all with a glassmorphism UI and streaming responses.

## Features Added (HW5)

### Chat Personalization

- **First & Last Name** fields added to the Create Account form.
- Names are saved in MongoDB and loaded on login.
- The AI system prompt is dynamically personalized so the assistant greets the user by name in the first message.

### YouTube Channel Data Download Tab

- A dedicated **"YouTube Channel Download"** tab appears after login.
- Enter any YouTube channel URL (e.g. `https://www.youtube.com/@veritasium`) and a max videos count (default 10, max 100).
- Downloads metadata for each video: title, description, transcript, duration, release date, view count, like count, comment count, video URL, and thumbnail.
- **Real-time progress bar** via Server-Sent Events (SSE) while downloading.
- Download the resulting JSON file locally or save it to the server's `public/` folder.
- Pre-downloaded sample data for 10 Veritasium videos is included at `public/veritasium_data.json`.

### JSON Chat Input

- **Drag and drop** a `.json` file into the chat to load YouTube channel data into the conversation context.
- The data is saved locally so tools can run computations on it.
- The system prompt automatically informs the AI about the loaded JSON structure and available fields.

### Chat Tool: `generateImage`

- Generate images from a text prompt directly in the chat.
- Optionally drag in an anchor/reference image for visual context.
- Generated images display inline with **click-to-enlarge** and **download** buttons.
- Defined in `prompt_chat.txt`.

### Chat Tool: `plot_metric_vs_time`

- Plot any numeric field (`view_count`, `like_count`, `comment_count`, `duration_seconds`, etc.) vs. time for channel videos.
- Renders as an interactive **Recharts AreaChart** component inside the chat.
- **Click to enlarge** into a modal; **download as PNG** from the modal.
- Defined in `prompt_chat.txt`.

### Chat Tool: `play_video`

- Ask the AI to "play", "show", or "open" a video from the loaded channel data.
- Displays a clickable card with the video title and thumbnail; clicking opens YouTube in a new tab.
- Supports selection by **title** (partial match, e.g. "play the asbestos video"), **ordinal** (e.g. "play the first video"), or **superlative** ("most viewed", "most liked", "longest", "newest").
- Defined in `prompt_chat.txt`.

### Chat Tool: `compute_stats_json`

- Computes **mean, median, standard deviation, min, and max** for any numeric field in the channel JSON.
- Triggered when the user asks for statistics, averages, or distributions of a metric.
- Defined in `prompt_chat.txt`.

### Prompt Engineering

- `public/prompt_chat.txt` defines the AI as a **YouTube Channel Analysis Assistant**.
- Explains the JSON data schema, all four tools (exact names and parameters), and behavioral guidelines.
- Changes to the prompt take effect on the next message with no rebuild required (30-second cache TTL).

### Existing Features (from base app)

- **Create account / Login** with bcrypt-hashed passwords
- **Session-based chat history** with sidebar listing all conversations
- **Streaming Gemini responses** with animated thinking indicator and stop button
- **Google Search grounding** with cited web sources
- **Python code execution** via Gemini for plots and complex analysis
- **CSV upload** with drag-and-drop, auto-computed engagement column, and client-side tools (`compute_column_stats`, `get_value_counts`, `get_top_tweets`)
- **Image support** via drag-and-drop, file picker, or clipboard paste
- **Markdown rendering** for headers, lists, code blocks, tables, and links

## How It Works

- **Frontend (React)** — Login/create account, tabbed UI (Chat + YouTube Download), drag-and-drop JSON/CSV/images, Recharts visualizations, streaming AI responses
- **Backend (Express)** — REST API for users, sessions, messages; YouTube data download via SSE; MongoDB persistence
- **AI (Gemini 2.5 Flash)** — Streaming chat, Google Search grounding, Python code execution, function calling for client-side tools
- **Image Generation (Gemini)** — Text-to-image via `gemini-2.0-flash-exp-image-generation`
- **YouTube Data (API v3)** — Channel resolution, video metadata, and transcript fetching via `googleapis` + `youtube-transcript`
- **Storage (MongoDB)** — Users (with first/last name) and chat sessions stored in `chatapp` database

## API Keys & Environment Variables

Create a `.env` file in the project root:

| Variable | Required | Where used | Description |
|----------|----------|------------|-------------|
| `REACT_APP_GEMINI_API_KEY` | Yes | Frontend | Google Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey)) |
| `REACT_APP_MONGODB_URI` | Yes | Backend | MongoDB Atlas connection string |
| `YOUTUBE_API_KEY` | Yes | Backend | YouTube Data API v3 key ([Google Cloud Console](https://console.cloud.google.com/) — enable "YouTube Data API v3") |
| `REACT_APP_API_URL` | Production only | Frontend | Full backend URL for production deployment |

### Example `.env` (local development)

```
REACT_APP_GEMINI_API_KEY=AIzaSy...
REACT_APP_MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
YOUTUBE_API_KEY=AIzaSy...
```

> **Tip:** If your network blocks DNS SRV lookups (common on VPNs/firewalls), use a direct `mongodb://` connection string instead of `mongodb+srv://`. See the MongoDB Atlas dashboard for the standard connection string format.

## MongoDB Setup

1. Create a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account and cluster.
2. Whitelist your IP address (or `0.0.0.0/0` for development).
3. Get your connection string (Database → Connect → Drivers).
4. Put it in `.env` as `REACT_APP_MONGODB_URI`.

All collections are created automatically on first use.

### Database: `chatapp`

#### Collection: `users`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Auto-generated |
| `username` | string | Lowercase username |
| `password` | string | bcrypt hash |
| `email` | string | Email address (optional) |
| `firstName` | string | User's first name |
| `lastName` | string | User's last name |
| `createdAt` | string | ISO timestamp |

#### Collection: `sessions`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Auto-generated — used as `session_id` |
| `username` | string | Owner of this chat |
| `agent` | string | AI persona |
| `title` | string | Auto-generated name |
| `createdAt` | string | ISO timestamp |
| `messages` | array | Ordered list of messages (see below) |

Each item in `messages`:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `"user"` or `"model"` |
| `content` | string | Message text |
| `timestamp` | string | ISO timestamp |
| `imageData` | array | *(optional)* Base64 image attachments `[{ data, mimeType }]` |
| `charts` | array | *(optional)* Chart/card data for rendered components |
| `toolCalls` | array | *(optional)* Tool invocations `[{ name, args, result }]` |

## Running the App

### Both together (single terminal)

```bash
npm install
npm start
```

This starts:

- **Backend** — http://localhost:3001
- **Frontend** — http://localhost:3000

Use the app at **http://localhost:3000**. The React dev server proxies `/api` requests to the backend.

### Separate terminals (recommended for development)

```bash
npm install
```

**Terminal 1 — Backend:**
```bash
npm run server
```

**Terminal 2 — Frontend:**
```bash
npm run client
```

### Verify Backend

- http://localhost:3001 — Server status page
- http://localhost:3001/api/status — JSON with DB connection status, user count, and session count

## Dependencies

All packages are installed via `npm install`.

### Frontend

| Package | Purpose |
|---------|---------|
| `react`, `react-dom` | UI framework |
| `react-scripts` | Create React App build tooling |
| `@google/generative-ai` | Gemini API client (chat, function calling, code execution, search, image generation) |
| `react-markdown` | Render markdown in AI responses |
| `remark-gfm` | GitHub-flavored markdown (tables, strikethrough, etc.) |
| `recharts` | Interactive area charts for metric-vs-time plots |
| `html-to-image` | Export charts as PNG for download |

### Backend

| Package | Purpose |
|---------|---------|
| `express` | HTTP server and REST API |
| `mongodb` | MongoDB driver |
| `bcryptjs` | Password hashing |
| `cors` | Cross-origin request headers |
| `dotenv` | Load `.env` variables |
| `googleapis` | YouTube Data API v3 client |
| `youtube-transcript` | Fetch video transcripts |

### Dev / Tooling

| Package | Purpose |
|---------|---------|
| `concurrently` | Run frontend and backend with a single `npm start` |

## Project Structure

```
chatapp_websearch_code/
├── public/
│   ├── prompt_chat.txt          # AI system prompt (editable, no rebuild needed)
│   └── veritasium_data.json     # Pre-downloaded sample data (10 videos)
├── server/
│   └── index.js                 # Express backend (auth, sessions, YouTube download, SSE)
├── src/
│   ├── App.js                   # Main app with tab navigation
│   ├── components/
│   │   ├── Auth.js              # Login / Create Account (with first & last name)
│   │   ├── Chat.js              # Chat interface, message rendering, file handling
│   │   ├── YouTubeDownload.js   # YouTube channel data download tab
│   │   ├── MetricTimePlot.js    # Recharts area chart with modal + download
│   │   ├── VideoCard.js         # Clickable YouTube video card
│   │   ├── ImageViewer.js       # Generated image display with enlarge + download
│   │   └── ChartModal.js        # Reusable modal for enlarged charts/images
│   └── services/
│       ├── gemini.js            # Gemini API integration (chat, tools, image gen)
│       ├── youtubeTools.js      # YouTube tool declarations + client-side executors
│       ├── csvTools.js          # CSV analysis tools (from base app)
│       └── mongoApi.js          # Frontend API client for backend endpoints
├── .env                         # API keys (not committed)
└── package.json
```

## Chat System Prompt

The AI's system instructions are loaded from **`public/prompt_chat.txt`**. Edit this file to change the assistant's behavior, available tools, or persona. Changes take effect within 30 seconds — no rebuild needed.

The prompt defines:
- The AI's role as a YouTube Channel Analysis Assistant
- All four tool names, purposes, and parameters
- Behavioral guidelines for tool usage and response formatting
