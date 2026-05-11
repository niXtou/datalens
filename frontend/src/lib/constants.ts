// ── Polling ───────────────────────────────────────────────────────────────────
export const POLL_MAX_ATTEMPTS = 10
export const POLL_INTERVAL_MS  = 300

// ── Chart dimensions ─────────────────────────────────────────────────────────
export const SCATTER_CHART_HEIGHT      = 300   // clustering scatter
export const REGRESSION_SCATTER_HEIGHT = 280   // actual-vs-predicted scatter
export const BAR_CHART_MIN_HEIGHT      = 180   // floor for horizontal bar chart
export const BAR_CHART_ROW_HEIGHT      = 40    // px per feature row in bar chart

// ── Y-axis label sizing ───────────────────────────────────────────────────────
// 7px per character is a safe estimate for the 12px monospace tick font Recharts uses.
export const AXIS_CHAR_WIDTH_PX = 7
export const AXIS_MIN_WIDTH     = 80
