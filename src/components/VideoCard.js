export default function VideoCard({ title, thumbnail, videoUrl, viewCount, likeCount }) {
  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="video-card"
      style={{ textDecoration: 'none' }}
    >
      <div className="video-card-inner">
        <div className="video-card-thumb-wrap">
          <img src={thumbnail} alt={title} className="video-card-thumb" />
          <div className="video-card-play-icon">▶</div>
        </div>
        <div className="video-card-info">
          <span className="video-card-title">{title}</span>
          <span className="video-card-meta">
            {viewCount != null && `${Number(viewCount).toLocaleString()} views`}
            {likeCount != null && ` · ${Number(likeCount).toLocaleString()} likes`}
          </span>
          <span className="video-card-cta">Click to open on YouTube →</span>
        </div>
      </div>
    </a>
  );
}
