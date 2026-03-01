import { useState, useRef, useCallback } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import { toPng } from 'html-to-image';
import ChartModal from './ChartModal';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'rgba(15,15,35,0.95)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10, padding: '0.6rem 0.9rem', fontSize: '0.8rem',
      color: '#e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: 260,
    }}>
      <p style={{ margin: 0, fontWeight: 700, color: '#fff' }}>{d.title}</p>
      <p style={{ margin: '0.3rem 0 0', color: '#818cf8' }}>
        {payload[0].value.toLocaleString()}
      </p>
      <p style={{ margin: '0.15rem 0 0', opacity: 0.5, fontSize: '0.72rem' }}>{d.date}</p>
    </div>
  );
}

function ChartContent({ data, chartTitle, metric }) {
  return (
    <div>
      <p style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
        {chartTitle}
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <defs>
            <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="date" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.12)' }} tickLine={false}
            angle={-30} textAnchor="end" interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            axisLine={false} tickLine={false} width={60}
            tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="value" stroke="#818cf8" fill={`url(#grad-${metric})`} strokeWidth={2} dot={{ r: 3, fill: '#818cf8' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MetricTimePlot({ data, chartTitle, metric }) {
  const [expanded, setExpanded] = useState(false);
  const modalChartRef = useRef(null);

  const handleDownload = useCallback(async () => {
    if (!modalChartRef.current) return;
    try {
      const url = await toPng(modalChartRef.current, { backgroundColor: '#0a0a1a' });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${metric}_over_time.png`;
      a.click();
    } catch (e) {
      console.error('Download failed:', e);
    }
  }, [metric]);

  if (!data?.length) return null;

  return (
    <>
      <div
        className="metric-plot-wrap"
        onClick={() => setExpanded(true)}
        style={{ cursor: 'pointer' }}
      >
        <ChartContent data={data} chartTitle={chartTitle} metric={metric} />
      </div>
      {expanded && (
        <ChartModal onClose={() => setExpanded(false)} onDownload={handleDownload}>
          <div ref={modalChartRef} style={{ width: '80vw', maxWidth: 900 }}>
            <ChartContent data={data} chartTitle={chartTitle} metric={metric} />
          </div>
        </ChartModal>
      )}
    </>
  );
}
