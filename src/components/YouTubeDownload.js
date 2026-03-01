import { useState } from 'react';
import './YouTubeDownload.css';

const API = process.env.REACT_APP_API_URL || '';

export default function YouTubeDownload({ username, onLogout }) {
  const [channelUrl, setChannelUrl] = useState('');
  const [maxVideos, setMaxVideos] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    if (!channelUrl.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setProgress(null);
    setStatus('Starting download...');

    try {
      const params = new URLSearchParams({ channelUrl: channelUrl.trim(), maxVideos });
      const eventSource = new EventSource(`${API}/api/youtube/download?${params}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'status') {
          setStatus(data.message);
        } else if (data.type === 'progress') {
          setProgress({ current: data.current, total: data.total });
          setStatus(`Downloading transcript ${data.current}/${data.total}: ${data.title}`);
        } else if (data.type === 'complete') {
          setResult(data.data);
          setStatus(`Done! Downloaded ${data.data.videos.length} videos from ${data.data.channel}`);
          setLoading(false);
          eventSource.close();
        } else if (data.type === 'error') {
          setError(data.message);
          setLoading(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setError('Connection lost. Please try again.');
        setLoading(false);
        eventSource.close();
      };
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDownloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(result.channel || 'channel').replace(/\s+/g, '_')}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToPublic = async () => {
    if (!result) return;
    try {
      const filename = (result.channel || 'channel').replace(/\s+/g, '_') + '_data';
      const res = await fetch(`${API}/api/youtube/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, data: result, username }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus(`Saved to public/${json.filename}`);
      } else {
        setError(json.error || 'Save failed');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="yt-download-layout">
      <div className="yt-download-card">
        <div className="yt-download-header">
          <h2>📺 YouTube Channel Download</h2>
          <p className="yt-download-subtitle">
            Enter a YouTube channel URL to download video metadata, transcripts, and statistics.
          </p>
        </div>

        <div className="yt-download-form">
          <label className="yt-label">Channel URL</label>
          <input
            type="text"
            className="yt-input"
            placeholder="https://www.youtube.com/@veritasium"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            disabled={loading}
          />

          <label className="yt-label">Max Videos</label>
          <input
            type="number"
            className="yt-input yt-input-short"
            value={maxVideos}
            min={1}
            max={100}
            onChange={(e) => setMaxVideos(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
            disabled={loading}
          />

          <button
            className="yt-download-btn"
            onClick={handleDownload}
            disabled={loading || !channelUrl.trim()}
          >
            {loading ? 'Downloading...' : 'Download Channel Data'}
          </button>
        </div>

        {(loading || status) && (
          <div className="yt-progress-section">
            <p className="yt-status">{status}</p>
            {progress && (
              <div className="yt-progress-bar-wrap">
                <div className="yt-progress-bar" style={{ width: `${progressPercent}%` }} />
                <span className="yt-progress-label">{progressPercent}%</span>
              </div>
            )}
          </div>
        )}

        {error && <p className="yt-error">{error}</p>}

        {result && (
          <div className="yt-result-section">
            <h3>Channel: {result.channel}</h3>
            <p>{result.videos.length} videos downloaded</p>

            <div className="yt-video-list">
              {result.videos.slice(0, 20).map((v, i) => (
                <div key={v.video_id} className="yt-video-item">
                  <img src={v.thumbnail} alt="" className="yt-thumb" />
                  <div className="yt-video-info">
                    <span className="yt-video-title">{v.title}</span>
                    <span className="yt-video-meta">
                      {v.view_count.toLocaleString()} views · {v.like_count.toLocaleString()} likes
                      {v.transcript ? ' · Transcript ✓' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="yt-result-actions">
              <button className="yt-action-btn" onClick={handleDownloadJson}>
                ⬇ Download JSON
              </button>
              <button className="yt-action-btn secondary" onClick={handleSaveToPublic}>
                💾 Save to Public Folder
              </button>
            </div>
          </div>
        )}

        <div className="yt-footer">
          <span className="yt-username">{username}</span>
          <button onClick={onLogout} className="yt-logout">Log out</button>
        </div>
      </div>
    </div>
  );
}
