import { useState } from 'react';
import ChartModal from './ChartModal';

export default function ImageViewer({ src, alt }) {
  const [expanded, setExpanded] = useState(false);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = 'generated_image.png';
    a.click();
  };

  return (
    <>
      <div className="image-viewer-wrap" onClick={() => setExpanded(true)}>
        <img src={src} alt={alt || 'Generated image'} className="image-viewer-img" />
        <div className="image-viewer-overlay">Click to enlarge</div>
      </div>
      {expanded && (
        <ChartModal onClose={() => setExpanded(false)} onDownload={handleDownload}>
          <img
            src={src}
            alt={alt || 'Generated image'}
            style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: 8 }}
          />
        </ChartModal>
      )}
    </>
  );
}
