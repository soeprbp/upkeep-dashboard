import { useEffect, useState, useCallback } from 'react';

interface StatusGroup {
  name: string;
  count: number;
  statusValues: string;
}

interface AgingSummary {
  olderThan7: number;
  olderThan14: number;
  olderThan30: number;
}

interface PriorityItem {
  name: string;
  count: number;
}

interface DashboardData {
  summary: StatusGroup[];
  agingSummary: AgingSummary;
  prioritySummary: PriorityItem[];
  generatedAt: string;
}

const CHART_COLORS: Record<string, string> = {
  Open: '#2563eb',
  'In Progress': '#7c3aed',
  'On Hold': '#d97706',
  Complete: '#059669',
  Other: '#64748b',
};

function DonutChart({ data, total }: { data: StatusGroup[]; total: number }) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const cx = 110;
  const cy = 110;

  let offsetRatio = 0;
  const segments = data
    .filter((d) => d.name !== 'Total' && d.count > 0)
    .map((d) => {
      const fraction = d.count / total;
      const dash = fraction * circumference;
      const gap = circumference - dash;
      const dashoffset = -1 * offsetRatio * circumference;
      offsetRatio += fraction;
      return { ...d, fraction, dash, gap, dashoffset, color: CHART_COLORS[d.name] || '#64748b' };
    });

  return (
    <div className="donut-container">
      <svg className="donut-svg" viewBox="0 0 220 220" aria-label="Status donut chart">
        {segments.length > 0 ? (
          <>
            {segments.map((s) => (
              <circle
                key={s.name}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="24"
                strokeLinecap="butt"
                transform="rotate(-90 110 110)"
                strokeDasharray={`${s.dash} ${s.gap}`}
                strokeDashoffset={s.dashoffset}
              />
            ))}
            <circle cx={cx} cy={cy} r={56} fill="white" />
            <text x={cx} y={102} className="donut-center-text">{total}</text>
            <text x={cx} y={124} className="donut-center-sub">Total</text>
          </>
        ) : (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="24" />
        )}
      </svg>
      <div className="legend">
        {segments.length > 0 ? (
          segments.map((s) => (
            <div key={s.name} className="legend-item">
              <div className="legend-left">
                <span className="legend-swatch" style={{ background: s.color }} />
                <span>{s.name}</span>
              </div>
              <span className="legend-value">{s.count}</span>
            </div>
          ))
        ) : (
          <div className="legend-item"><span>No data available</span></div>
        )}
      </div>
    </div>
  );
}

function getCount(summary: StatusGroup[], name: string): number {
  return summary.find((s) => s.name === name)?.count ?? 0;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch('/api/work-orders', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const json: DashboardData = await res.json();
      setData(json);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
        <button onClick={fetchData} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, agingSummary, prioritySummary, generatedAt } = data;

  const openCount = getCount(summary, 'Open');
  const inProgressCount = getCount(summary, 'In Progress');
  const onHoldCount = getCount(summary, 'On Hold');
  const completeCount = getCount(summary, 'Complete');
  const otherCount = getCount(summary, 'Other');
  const totalCount = getCount(summary, 'Total');

  const activeCount = openCount + inProgressCount + onHoldCount;
  const activePct = totalCount > 0 ? Math.round((activeCount / totalCount) * 1000) / 10 : 0;
  const completePct = totalCount > 0 ? Math.round((completeCount / totalCount) * 1000) / 10 : 0;

  const barMax = Math.max(openCount, inProgressCount, onHoldCount, completeCount, otherCount, 1);
  const barPct = (v: number) => Math.round((v / barMax) * 1000) / 10;

  const generatedLocal = new Date(generatedAt).toLocaleString();

  const statusRows = summary
    .filter((s) => s.name !== 'Total')
    .map((s) => {
      const rowClass = {
        Open: 'status-open',
        'In Progress': 'status-progress',
        'On Hold': 'status-hold',
        Complete: 'status-complete',
        Other: 'status-other',
      }[s.name] || '';

      return (
        <tr key={s.name} className={rowClass}>
          <td className="status-name">{s.name}</td>
          <td className="status-count">{s.count}</td>
          <td className="status-values">{s.statusValues}</td>
        </tr>
      );
    });

  const priorityRows = prioritySummary.map((p) => {
    const width = totalCount > 0 ? Math.round((p.count / totalCount) * 1000) / 10 : 0;
    return (
      <div key={p.name} className="priority-row">
        <div className="priority-top">
          <span className="priority-name">{p.name}</span>
          <span className="priority-count">{p.count}</span>
        </div>
        <div className="priority-bar-track">
          <div className="priority-bar-fill" style={{ width: `${width}%` }} />
        </div>
      </div>
    );
  });

  const barData = [
    { label: 'Open', count: openCount, cls: 'fill-open' },
    { label: 'In Progress', count: inProgressCount, cls: 'fill-progress' },
    { label: 'On Hold', count: onHoldCount, cls: 'fill-hold' },
    { label: 'Complete', count: completeCount, cls: 'fill-complete' },
    { label: 'Other', count: otherCount, cls: 'fill-other' },
  ];

  return (
    <div className="container">
      <div className="header">
        <div className="header-left">
          <h1>UpKeep Work Order Dashboard</h1>
          <p>Status overview, aging, and priority mix.</p>
        </div>
        <div className="header-right">
          <span className="label">Last Updated</span>
          <div className="value">{generatedLocal}</div>
          <span className="label">Auto-refreshes every 5 minutes</span>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card kpi-open">
          <div className="kpi-label">Open</div>
          <div className="kpi-value">{openCount}</div>
        </div>
        <div className="kpi-card kpi-progress">
          <div className="kpi-label">In Progress</div>
          <div className="kpi-value">{inProgressCount}</div>
        </div>
        <div className="kpi-card kpi-hold">
          <div className="kpi-label">On Hold</div>
          <div className="kpi-value">{onHoldCount}</div>
        </div>
        <div className="kpi-card kpi-complete">
          <div className="kpi-label">Complete</div>
          <div className="kpi-value">{completeCount}</div>
        </div>
        <div className="kpi-card kpi-other">
          <div className="kpi-label">Other</div>
          <div className="kpi-value">{otherCount}</div>
        </div>
        <div className="kpi-card kpi-total">
          <div className="kpi-label">Total Cached</div>
          <div className="kpi-value">{totalCount}</div>
        </div>
      </div>

      <div className="aging-grid">
        <div className="aging-card">
          <div className="aging-label">Open Older Than 7 Days</div>
          <div className="aging-value">{agingSummary.olderThan7}</div>
        </div>
        <div className="aging-card">
          <div className="aging-label">Open Older Than 14 Days</div>
          <div className="aging-value">{agingSummary.olderThan14}</div>
        </div>
        <div className="aging-card">
          <div className="aging-label">Open Older Than 30 Days</div>
          <div className="aging-value">{agingSummary.olderThan30}</div>
        </div>
      </div>

      <div className="main-grid">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Status Mix</h2>
            <p className="panel-subtitle">Current distribution by grouped status.</p>
          </div>
          <div className="panel-body chart-wrap">
            <DonutChart data={summary} total={totalCount} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Status Totals</h2>
            <p className="panel-subtitle">Bar view for quick comparison.</p>
          </div>
          <div className="panel-body">
            <div className="bar-chart">
              {barData.map((b) => (
                <div key={b.label} className="bar-row">
                  <div className="bar-top">
                    <span className="bar-label">{b.label}</span>
                    <span className="bar-value">{b.count}</span>
                  </div>
                  <div className="bar-track">
                    <div className={`bar-fill ${b.cls}`} style={{ width: `${barPct(b.count)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Priority Breakdown</h2>
            <p className="panel-subtitle">Based on the available priority field.</p>
          </div>
          <div className="panel-body">
            <div className="priority-list">{priorityRows}</div>
          </div>
        </div>
      </div>

      <div className="bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Work Order Status Breakdown</h2>
            <p className="panel-subtitle">Grouped view instead of raw UpKeep status values.</p>
          </div>
          <div className="panel-body">
            <table className="status-table">
              <thead>
                <tr>
                  <th>Status Group</th>
                  <th>Count</th>
                  <th>Included Raw Statuses</th>
                </tr>
              </thead>
              <tbody>{statusRows}</tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Snapshot</h2>
            <p className="panel-subtitle">Current headline numbers.</p>
          </div>
          <div className="panel-body">
            <div className="priority-list">
              <div className="priority-row">
                <div className="priority-top">
                  <span className="priority-name">Total Cached Work Orders</span>
                  <span className="priority-count">{totalCount}</span>
                </div>
                <div className="priority-bar-track">
                  <div className="priority-bar-fill" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="priority-row">
                <div className="priority-top">
                  <span className="priority-name">Open + In Progress + On Hold</span>
                  <span className="priority-count">{activeCount}</span>
                </div>
                <div className="priority-bar-track">
                  <div className="priority-bar-fill" style={{ width: `${activePct}%` }} />
                </div>
              </div>
              <div className="priority-row">
                <div className="priority-top">
                  <span className="priority-name">Completed / Closed</span>
                  <span className="priority-count">{completeCount}</span>
                </div>
                <div className="priority-bar-track">
                  <div className="priority-bar-fill" style={{ width: `${completePct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-note">Dashboard auto-refreshes every 5 minutes.</div>
    </div>
  );
}
