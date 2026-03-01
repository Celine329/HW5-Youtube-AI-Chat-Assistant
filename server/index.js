require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { google } = require('googleapis');
const { YoutubeTranscript } = require('youtube-transcript');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_KEY });

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: firstName ? String(firstName).trim() : '',
      lastName: lastName ? String(lastName).trim() : '',
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({ ok: true, username: name, firstName: user.firstName || '', lastName: user.lastName || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube Channel Download (SSE for progress) ─────────────────────────────

async function resolveChannelId(input) {
  const handleMatch = input.match(/@([\w.-]+)/);
  if (handleMatch) {
    const res = await youtube.search.list({
      part: 'snippet',
      q: handleMatch[1],
      type: 'channel',
      maxResults: 1,
    });
    if (res.data.items?.length) return res.data.items[0].snippet.channelId;
  }
  const idMatch = input.match(/channel\/(UC[\w-]+)/);
  if (idMatch) return idMatch[1];
  const res = await youtube.search.list({
    part: 'snippet',
    q: input,
    type: 'channel',
    maxResults: 1,
  });
  if (res.data.items?.length) return res.data.items[0].snippet.channelId;
  return null;
}

async function getChannelVideos(channelId, maxVideos) {
  const videoIds = [];
  let pageToken = '';
  while (videoIds.length < maxVideos) {
    const res = await youtube.search.list({
      part: 'id',
      channelId,
      order: 'date',
      type: 'video',
      maxResults: Math.min(50, maxVideos - videoIds.length),
      pageToken: pageToken || undefined,
    });
    for (const item of (res.data.items || [])) {
      if (item.id?.videoId) videoIds.push(item.id.videoId);
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return videoIds.slice(0, maxVideos);
}

async function getVideoDetails(videoIds) {
  const details = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: batch.join(','),
    });
    details.push(...(res.data.items || []));
  }
  return details;
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

async function fetchTranscript(videoId) {
  try {
    const t = await YoutubeTranscript.fetchTranscript(videoId);
    return t.map(s => s.text).join(' ');
  } catch {
    return null;
  }
}

app.get('/api/youtube/download', async (req, res) => {
  const { channelUrl, maxVideos: maxStr } = req.query;
  const maxVideos = Math.min(parseInt(maxStr) || 10, 100);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    if (!YOUTUBE_KEY) {
      send({ type: 'error', message: 'YouTube API key is not configured. Add YOUTUBE_API_KEY to your .env file.' });
      return res.end();
    }

    send({ type: 'status', message: 'Resolving channel...' });
    const channelId = await resolveChannelId(channelUrl);
    if (!channelId) {
      send({ type: 'error', message: 'Could not find channel. Check the URL and ensure YouTube Data API v3 is enabled for your API key.' });
      return res.end();
    }

    const channelInfo = await youtube.channels.list({ part: 'snippet', id: channelId });
    const channelTitle = channelInfo.data.items?.[0]?.snippet?.title || 'Unknown';
    send({ type: 'status', message: `Found channel: ${channelTitle}. Fetching video list...` });

    const videoIds = await getChannelVideos(channelId, maxVideos);
    send({ type: 'status', message: `Found ${videoIds.length} videos. Fetching details...` });

    const details = await getVideoDetails(videoIds);
    const videos = [];

    for (let i = 0; i < details.length; i++) {
      const v = details[i];
      send({ type: 'progress', current: i + 1, total: details.length, title: v.snippet.title });

      const transcript = await fetchTranscript(v.id);

      videos.push({
        video_id: v.id,
        title: v.snippet.title,
        description: v.snippet.description,
        thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || '',
        published_at: v.snippet.publishedAt,
        duration_seconds: parseDuration(v.contentDetails.duration),
        view_count: parseInt(v.statistics.viewCount || 0),
        like_count: parseInt(v.statistics.likeCount || 0),
        comment_count: parseInt(v.statistics.commentCount || 0),
        video_url: `https://www.youtube.com/watch?v=${v.id}`,
        transcript: transcript,
      });
    }

    const result = { channel: channelTitle, channel_id: channelId, downloaded_at: new Date().toISOString(), videos };
    send({ type: 'complete', data: result });
  } catch (err) {
    console.error('YouTube download error:', err);
    const msg = err.message || 'Download failed';
    const hint = msg.includes('API key') || msg.includes('403')
      ? ' Make sure YouTube Data API v3 is enabled in your Google Cloud Console for this API key.'
      : '';
    send({ type: 'error', message: msg + hint });
  }
  res.end();
});

// Endpoint to save channel JSON to public folder
app.post('/api/youtube/save', async (req, res) => {
  try {
    const { filename, data } = req.body;
    const safeName = (filename || 'channel_data').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
    const publicDir = path.join(__dirname, '..', 'public');
    fs.writeFileSync(path.join(publicDir, safeName), JSON.stringify(data, null, 2));
    res.json({ ok: true, filename: safeName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
