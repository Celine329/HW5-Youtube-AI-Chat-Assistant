// YouTube channel JSON tool declarations and executors for Gemini function calling

const FIELD_NOTE = 'Use the exact field name from the loaded JSON (e.g. "view_count", "like_count", "comment_count", "duration_seconds").';

export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate an image based on a text prompt. Use this when the user asks to create, generate, draw, or make an image. ' +
      'If the user has provided an anchor/reference image in the chat, it will be used as visual context. ' +
      'Returns a marker; the actual image generation is handled by the frontend.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Detailed text prompt describing the image to generate.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot any numeric field from the YouTube channel JSON vs time (published date). ' +
      'Creates a line chart showing how a metric changes across videos over time. ' +
      'Use when the user asks for a chart, plot, graph, or trend of views, likes, comments, etc. over time. ' +
      FIELD_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: {
          type: 'STRING',
          description: 'The numeric field to plot on the Y-axis (e.g. "view_count", "like_count", "comment_count", "duration_seconds").',
        },
        title: {
          type: 'STRING',
          description: 'Optional chart title. If not provided, auto-generates from metric name.',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'play_video',
    description:
      'Play/open a YouTube video from the loaded channel data. Shows a clickable card with title and thumbnail that opens YouTube in a new tab. ' +
      'The user can specify a video by title (partial match), ordinal ("first", "second", "third", "1st", "2nd"), ' +
      'or superlative ("most viewed", "most liked", "least viewed", "longest", "newest"). ' +
      'Use when the user says "play", "show", "open", or "watch" a video.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'The video to find: a title keyword (partial match), ordinal ("first", "3rd"), or superlative ("most viewed", "most liked").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'compute_stats_json',
    description:
      'Compute descriptive statistics (mean, median, standard deviation, min, max) for any numeric field in the loaded YouTube channel JSON. ' +
      'Use when the user asks for statistics, average, mean, distribution, or summary of a numeric field like view_count, like_count, comment_count, or duration_seconds. ' +
      FIELD_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description: 'The numeric field name (e.g. "view_count", "like_count", "comment_count", "duration_seconds").',
        },
      },
      required: ['field'],
    },
  },
];

const fmt = (n) => +n.toFixed(4);

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
}

const ORDINALS = {
  first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2,
  fourth: 3, '4th': 3, fifth: 4, '5th': 4, sixth: 5, '6th': 5,
  seventh: 6, '7th': 6, eighth: 7, '8th': 7, ninth: 8, '9th': 8,
  tenth: 9, '10th': 9, last: -1,
};

function resolveField(videos, name) {
  if (!videos.length || !name) return name;
  const keys = Object.keys(videos[0]);
  if (keys.includes(name)) return name;
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(name);
  return keys.find((k) => norm(k) === target) || name;
}

function findVideo(videos, query) {
  const q = query.toLowerCase().trim();

  if (ORDINALS[q] !== undefined) {
    const idx = ORDINALS[q] === -1 ? videos.length - 1 : ORDINALS[q];
    return videos[idx] || null;
  }

  const numMatch = q.match(/^(\d+)(?:st|nd|rd|th)?$/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    return videos[idx] || null;
  }

  const superlatives = [
    { pattern: /most\s*view/i, field: 'view_count', desc: true },
    { pattern: /least\s*view/i, field: 'view_count', desc: false },
    { pattern: /most\s*lik/i, field: 'like_count', desc: true },
    { pattern: /least\s*lik/i, field: 'like_count', desc: false },
    { pattern: /most\s*comment/i, field: 'comment_count', desc: true },
    { pattern: /least\s*comment/i, field: 'comment_count', desc: false },
    { pattern: /long(est)?/i, field: 'duration_seconds', desc: true },
    { pattern: /short(est)?/i, field: 'duration_seconds', desc: false },
    { pattern: /new(est)?|latest|recent/i, field: 'published_at', desc: true },
    { pattern: /old(est)?|earliest/i, field: 'published_at', desc: false },
  ];

  for (const s of superlatives) {
    if (s.pattern.test(q)) {
      const sorted = [...videos].sort((a, b) => {
        const av = s.field === 'published_at' ? new Date(a[s.field]).getTime() : Number(a[s.field]);
        const bv = s.field === 'published_at' ? new Date(b[s.field]).getTime() : Number(b[s.field]);
        return s.desc ? bv - av : av - bv;
      });
      return sorted[0] || null;
    }
  }

  const titleMatch = videos.find((v) => v.title.toLowerCase().includes(q));
  if (titleMatch) return titleMatch;

  const words = q.split(/\s+/).filter(w => w.length > 2);
  const fuzzy = videos.find((v) => words.some(w => v.title.toLowerCase().includes(w)));
  return fuzzy || null;
}

export function executeYoutubeTool(toolName, args, videos) {
  switch (toolName) {
    case 'compute_stats_json': {
      const field = resolveField(videos, args.field);
      const vals = videos.map((v) => Number(v[field])).filter((n) => !isNaN(n));
      if (!vals.length) {
        return { error: `No numeric values found for field "${field}". Available fields: ${Object.keys(videos[0] || {}).join(', ')}` };
      }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: fmt(mean),
        median: fmt(median(sorted)),
        std: fmt(Math.sqrt(variance)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    case 'plot_metric_vs_time': {
      const metric = resolveField(videos, args.metric);
      const data = videos
        .filter((v) => v.published_at && !isNaN(Number(v[metric])))
        .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
        .map((v) => ({
          date: new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: 'numeric' }),
          value: Number(v[metric]),
          title: v.title,
          rawDate: v.published_at,
        }));

      if (!data.length) {
        return { error: `No plottable data for field "${metric}".` };
      }

      return {
        _chartType: 'metric_time_plot',
        metric,
        chartTitle: args.title || `${metric.replace(/_/g, ' ')} over time`,
        data,
      };
    }

    case 'play_video': {
      const video = findVideo(videos, args.query);
      if (!video) {
        const titles = videos.slice(0, 5).map((v, i) => `${i + 1}. ${v.title}`).join('\n');
        return { error: `Could not find a video matching "${args.query}". Available videos:\n${titles}\n...` };
      }
      return {
        _chartType: 'video_card',
        title: video.title,
        thumbnail: video.thumbnail,
        videoUrl: video.video_url,
        viewCount: video.view_count,
        likeCount: video.like_count,
      };
    }

    case 'generateImage': {
      return {
        _chartType: 'generated_image',
        prompt: args.prompt,
        _needsGeneration: true,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
