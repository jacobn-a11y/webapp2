/**
 * Analytics Dashboard Routes
 *
 * Provides:
 *   - GET /api/analytics/data  — JSON payload of all org-wide metrics
 *   - GET /api/analytics/view  — Server-rendered HTML dashboard with Chart.js
 *
 * Charts rendered:
 *   1. Calls per week (bar chart)
 *   2. Funnel stage distribution (donut chart)
 *   3. Top 10 accounts by call volume (horizontal bar)
 *   4. Entity resolution success rate over time (line chart)
 *   5. Most common taxonomy topics (treemap)
 *   6. High-value quote leaderboard (table)
 *   7. Landing page performance (line chart + table)
 */

import { Router, type Request, type Response } from "express";
import type { PrismaClient, UserRole } from "@prisma/client";
import { AnalyticsService, type AnalyticsDashboardData } from "../services/analytics-service.js";
import { requirePermission } from "../middleware/permissions.js";

interface AuthReq extends Request {
  organizationId?: string;
  userId?: string;
  userRole?: UserRole;
}

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createAnalyticsRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const analytics = new AnalyticsService(prisma);

  /**
   * GET /api/analytics/data
   *
   * Returns the full analytics payload as JSON.
   */
  router.get(
    "/data",
    requirePermission(prisma, "view_analytics"),
    async (req: AuthReq, res: Response) => {
      if (!req.organizationId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      try {
        const data = await analytics.getDashboardData(req.organizationId);
        res.json(data);
      } catch (err) {
        console.error("Analytics data error:", err);
        res.status(500).json({ error: "Failed to load analytics data" });
      }
    }
  );

  /**
   * GET /api/analytics/view
   *
   * Renders a full-page HTML analytics dashboard with Chart.js charts.
   */
  router.get(
    "/view",
    requirePermission(prisma, "view_analytics"),
    async (req: AuthReq, res: Response) => {
      if (!req.organizationId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      try {
        const data = await analytics.getDashboardData(req.organizationId);
        res.setHeader("Cache-Control", "private, no-cache");
        res.send(renderDashboardHtml(data));
      } catch (err) {
        console.error("Analytics view error:", err);
        res.status(500).json({ error: "Failed to render analytics dashboard" });
      }
    }
  );

  return router;
}

// ─── HTML Rendering ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDashboardHtml(data: AnalyticsDashboardData): string {
  const funnelStageLabels: Record<string, string> = {
    TOFU: "Top of Funnel",
    MOFU: "Mid-Funnel",
    BOFU: "Bottom of Funnel",
    POST_SALE: "Post-Sale",
    INTERNAL: "Internal",
    VERTICAL: "Vertical",
  };

  // Prepare JSON data for Chart.js (embedded in script)
  const chartData = {
    callsPerWeek: {
      labels: data.callsPerWeek.map((d) => d.week),
      values: data.callsPerWeek.map((d) => d.count),
    },
    funnel: {
      labels: data.funnelDistribution.map(
        (d) => funnelStageLabels[d.stage] ?? d.stage
      ),
      values: data.funnelDistribution.map((d) => d.count),
    },
    topAccounts: {
      labels: data.topAccountsByCallVolume.map((d) => d.accountName),
      values: data.topAccountsByCallVolume.map((d) => d.callCount),
    },
    entityResolution: {
      labels: data.entityResolutionOverTime.map((d) => d.month),
      rates: data.entityResolutionOverTime.map((d) =>
        Math.round(d.rate * 100)
      ),
    },
    topics: data.topTopics.map((t) => ({
      label: t.label,
      value: t.count,
    })),
    pageViews: {
      labels: data.pageViewsOverTime.map((d) => d.month),
      views: data.pageViewsOverTime.map((d) => d.totalViews),
      published: data.pageViewsOverTime.map((d) => d.pagesPublished),
    },
  };

  // Quote leaderboard table rows
  const quoteRows = data.quoteLeaderboard
    .map(
      (q, i) =>
        `<tr>
          <td class="rank">${i + 1}</td>
          <td>${escapeHtml(q.accountName)}</td>
          <td class="num">${q.quoteCount}</td>
        </tr>`
    )
    .join("\n");

  // Top pages table rows
  const pageRows = data.topPagesByViews
    .map(
      (p, i) =>
        `<tr>
          <td class="rank">${i + 1}</td>
          <td>${escapeHtml(p.title)}</td>
          <td class="num">${p.viewCount.toLocaleString()}</td>
        </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Analytics Dashboard - StoryEngine</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #f8f9fb;
      --surface: #ffffff;
      --text: #1a1a2e;
      --text-secondary: #555770;
      --accent: #4f46e5;
      --accent-light: #eef2ff;
      --border: #e5e7eb;
      --green: #059669;
      --amber: #d97706;
      --red: #dc2626;
      --purple: #7c3aed;
      --blue: #2563eb;
      --radius: 12px;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      font-size: 14px;
      -webkit-font-smoothing: antialiased;
    }

    /* ─── Layout ─────────────────────────────────────────── */
    .dashboard {
      max-width: 1280px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    .dashboard-header {
      margin-bottom: 2rem;
    }
    .dashboard-header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .dashboard-header p {
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }

    .grid {
      display: grid;
      gap: 1.5rem;
    }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }

    /* ─── Card ───────────────────────────────────────────── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      box-shadow: var(--shadow);
    }
    .card:hover { box-shadow: var(--shadow-md); }
    .card h2 {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      margin-bottom: 1rem;
    }
    .card--full { grid-column: 1 / -1; }

    .chart-container {
      position: relative;
      width: 100%;
      height: 300px;
    }
    .chart-container--sm { height: 260px; }

    /* ─── Treemap (CSS grid-based) ───────────────────────── */
    .treemap {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      height: 280px;
      align-content: flex-start;
    }
    .treemap-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 0.72rem;
      font-weight: 500;
      color: white;
      overflow: hidden;
      line-height: 1.2;
      transition: opacity 0.2s;
      cursor: default;
    }
    .treemap-cell:hover { opacity: 0.85; }
    .treemap-cell span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ─── Tables ─────────────────────────────────────────── */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .data-table th {
      text-align: left;
      font-weight: 600;
      color: var(--text-secondary);
      padding: 0.5rem 0.75rem;
      border-bottom: 2px solid var(--border);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .data-table td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid var(--border);
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table .rank {
      width: 36px;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .data-table .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .data-table tr:hover td { background: var(--accent-light); }

    /* ─── Empty State ────────────────────────────────────── */
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    /* ─── Responsive ─────────────────────────────────────── */
    @media (max-width: 900px) {
      .grid-2, .grid-3 { grid-template-columns: 1fr; }
      .dashboard { padding: 1rem; }
    }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
</head>
<body>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Analytics Dashboard</h1>
      <p>Org-wide metrics across calls, topics, accounts, and landing pages</p>
    </header>

    <!-- Row 1: Calls per week (full width) -->
    <div class="grid" style="margin-bottom:1.5rem">
      <div class="card card--full">
        <h2>Calls Per Week</h2>
        <div class="chart-container">
          <canvas id="callsPerWeekChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Row 2: Funnel distribution + Top accounts -->
    <div class="grid grid-2" style="margin-bottom:1.5rem">
      <div class="card">
        <h2>Funnel Stage Distribution</h2>
        <div class="chart-container chart-container--sm">
          <canvas id="funnelChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>Top 10 Accounts by Call Volume</h2>
        <div class="chart-container chart-container--sm">
          <canvas id="topAccountsChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Row 3: Entity resolution + Topics treemap -->
    <div class="grid grid-2" style="margin-bottom:1.5rem">
      <div class="card">
        <h2>Entity Resolution Success Rate</h2>
        <div class="chart-container chart-container--sm">
          <canvas id="entityResolutionChart"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>Most Common Taxonomy Topics</h2>
        <div id="treemap" class="treemap">
          ${renderTreemapCells(data.topTopics)}
        </div>
      </div>
    </div>

    <!-- Row 4: Quote leaderboard + Page performance -->
    <div class="grid grid-2" style="margin-bottom:1.5rem">
      <div class="card">
        <h2>High-Value Quote Leaderboard</h2>
        ${
          data.quoteLeaderboard.length > 0
            ? `<table class="data-table">
                <thead>
                  <tr><th>#</th><th>Account</th><th style="text-align:right">Quotes</th></tr>
                </thead>
                <tbody>${quoteRows}</tbody>
              </table>`
            : '<div class="empty-state">No quantified-value quotes yet</div>'
        }
      </div>
      <div class="card">
        <h2>Top Pages by Views</h2>
        ${
          data.topPagesByViews.length > 0
            ? `<table class="data-table">
                <thead>
                  <tr><th>#</th><th>Page</th><th style="text-align:right">Views</th></tr>
                </thead>
                <tbody>${pageRows}</tbody>
              </table>`
            : '<div class="empty-state">No landing pages yet</div>'
        }
      </div>
    </div>

    <!-- Row 5: Page views over time (full width) -->
    <div class="grid" style="margin-bottom:1.5rem">
      <div class="card card--full">
        <h2>Landing Page Views Over Time</h2>
        <div class="chart-container">
          <canvas id="pageViewsChart"></canvas>
        </div>
      </div>
    </div>
  </div>

  <script>
    const CHART_DATA = ${JSON.stringify(chartData)};

    const COLORS = {
      accent: '#4f46e5',
      accentLight: 'rgba(79,70,229,0.15)',
      green: '#059669',
      greenLight: 'rgba(5,150,105,0.15)',
      purple: '#7c3aed',
      amber: '#d97706',
      blue: '#2563eb',
      red: '#dc2626',
      funnelPalette: [
        '#4f46e5', // TOFU
        '#7c3aed', // MOFU
        '#2563eb', // BOFU
        '#059669', // POST_SALE
        '#d97706', // INTERNAL
        '#dc2626', // VERTICAL
      ],
    };

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#555770';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';

    // 1. Calls Per Week — Bar Chart
    new Chart(document.getElementById('callsPerWeekChart'), {
      type: 'bar',
      data: {
        labels: CHART_DATA.callsPerWeek.labels,
        datasets: [{
          label: 'Calls',
          data: CHART_DATA.callsPerWeek.values,
          backgroundColor: COLORS.accent,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 48,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45 },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: 'rgba(0,0,0,0.04)' },
          },
        },
      },
    });

    // 2. Funnel Stage Distribution — Donut Chart
    new Chart(document.getElementById('funnelChart'), {
      type: 'doughnut',
      data: {
        labels: CHART_DATA.funnel.labels,
        datasets: [{
          data: CHART_DATA.funnel.values,
          backgroundColor: COLORS.funnelPalette,
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'right',
            labels: { padding: 12, font: { size: 11 } },
          },
        },
      },
    });

    // 3. Top 10 Accounts — Horizontal Bar
    new Chart(document.getElementById('topAccountsChart'), {
      type: 'bar',
      data: {
        labels: CHART_DATA.topAccounts.labels,
        datasets: [{
          label: 'Calls',
          data: CHART_DATA.topAccounts.values,
          backgroundColor: COLORS.purple,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 20,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: 'rgba(0,0,0,0.04)' },
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
        },
      },
    });

    // 4. Entity Resolution Success Rate — Line Chart
    new Chart(document.getElementById('entityResolutionChart'), {
      type: 'line',
      data: {
        labels: CHART_DATA.entityResolution.labels,
        datasets: [{
          label: 'Success Rate (%)',
          data: CHART_DATA.entityResolution.rates,
          borderColor: COLORS.green,
          backgroundColor: COLORS.greenLight,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: COLORS.green,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.parsed.y + '%'; },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            min: 0,
            max: 100,
            ticks: {
              callback: function(v) { return v + '%'; },
              stepSize: 20,
            },
            grid: { color: 'rgba(0,0,0,0.04)' },
          },
        },
      },
    });

    // 5. Landing Page Views Over Time — Line Chart
    new Chart(document.getElementById('pageViewsChart'), {
      type: 'line',
      data: {
        labels: CHART_DATA.pageViews.labels,
        datasets: [
          {
            label: 'Total Views',
            data: CHART_DATA.pageViews.views,
            borderColor: COLORS.blue,
            backgroundColor: 'rgba(37,99,235,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: COLORS.blue,
            yAxisID: 'y',
          },
          {
            label: 'Pages Published',
            data: CHART_DATA.pageViews.published,
            borderColor: COLORS.amber,
            backgroundColor: 'rgba(217,119,6,0.1)',
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: COLORS.amber,
            borderDash: [5, 5],
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { padding: 16, font: { size: 11 } },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: 'rgba(0,0,0,0.04)' },
            title: { display: true, text: 'Views', font: { size: 11 } },
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Pages Published', font: { size: 11 } },
          },
        },
      },
    });
  </script>
</body>
</html>`;
}

// ─── Treemap Rendering ───────────────────────────────────────────────────────

const TREEMAP_COLORS = [
  "#4f46e5",
  "#7c3aed",
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#be185d",
  "#4338ca",
  "#0d9488",
  "#b45309",
  "#9333ea",
  "#1d4ed8",
  "#047857",
  "#c2410c",
  "#7e22ce",
  "#1e40af",
  "#065f46",
  "#b91c1c",
  "#6d28d9",
];

function renderTreemapCells(
  topics: { label: string; count: number }[]
): string {
  if (topics.length === 0) {
    return '<div class="empty-state" style="width:100%">No taxonomy data yet</div>';
  }

  const total = topics.reduce((s, t) => s + t.count, 0);
  if (total === 0) {
    return '<div class="empty-state" style="width:100%">No taxonomy data yet</div>';
  }

  return topics
    .map((t, i) => {
      const pct = (t.count / total) * 100;
      // Minimum width so labels are readable
      const width = Math.max(pct, 4);
      const color = TREEMAP_COLORS[i % TREEMAP_COLORS.length];
      const height = pct > 10 ? "100%" : pct > 5 ? "65%" : "45%";
      return `<div class="treemap-cell" style="flex-basis:calc(${width.toFixed(
        1
      )}% - 4px);height:${height};background:${color}" title="${escapeHtml(
        t.label
      )}: ${t.count}">
        <span>${escapeHtml(t.label)}<br>${t.count}</span>
      </div>`;
    })
    .join("\n");
}
