import { useEffect } from 'react';

export default function ChartModal({ children, onClose, onDownload }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="chart-modal-backdrop" onClick={onClose}>
      <div className="chart-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="chart-modal-close" onClick={onClose}>×</button>
        <div className="chart-modal-body">{children}</div>
        {onDownload && (
          <button className="chart-modal-download" onClick={onDownload}>⬇ Download</button>
        )}
      </div>
    </div>
  );
}
