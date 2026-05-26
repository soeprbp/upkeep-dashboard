import Head from 'next/head';

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
  teamName: string;
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

export default function Dashboard({ data, error }: { data: DashboardData | null; error: string | null }) {
  if (error) {
    return (
      <div className="container">
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, agingSummary, prioritySummary, generatedAt, teamName } = data;

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
      <Head>
        <meta httpEquiv="refresh" content="900" />
      </Head>
      <div className="header">
        <div className="header-left">
          <h1>UpKeep Work Order Dashboard</h1>
          <p className="team-badge">{teamName}</p>
          <p>Status overview, aging, and priority mix — covering the last 30 days.</p>
        </div>
        <div className="header-right">
          <span className="label">Last Updated</span>
          <div className="value">{generatedLocal}</div>
          <span className="label">Refreshes every 15 minutes</span>
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

      <div className="footer-note">Dashboard auto-refreshes every 15 minutes via GitHub Actions.</div>
    </div>
  );
}

const UPKEEP_BASE_URL = 'https://api.onupkeep.com/api/v2';
const PAGE_SIZE = 200;
const INITIAL_LOOKBACK_DAYS = 50;
const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGES = 5;
const TEAM_NAME = 'Weekly Team Performance Report Group';

interface WorkOrder {
  id: string;
  status: string;
  assignedToUser?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  requestDate?: string;
  date?: string;
  dueDate?: string;
  priority?: string;
  priorityName?: string;
  workOrderPriority?: string;
  priorityLabel?: string;
}

interface TeamsListResponse {
  success: boolean;
  results?: Array<{ id: string; name: string }>;
}

interface TeamUsersResponse {
  success: boolean;
  results?: Array<{ id: string }>;
}

interface AuthResponse {
  success: boolean;
  result?: { sessionToken: string };
}

interface WorkOrdersResponse {
  success: boolean;
  results?: WorkOrder[];
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSessionToken(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ email, password });
  const response = await fetchWithTimeout(
    `${UPKEEP_BASE_URL}/auth`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    FETCH_TIMEOUT_MS
  );
  const data: AuthResponse = await response.json();
  if (!data.success || !data.result?.sessionToken) {
    throw new Error('Authentication failed');
  }
  return data.result.sessionToken;
}

async function getAllWorkOrders(token: string): Promise<WorkOrder[]> {
  const all: WorkOrder[] = [];
  let offset = 0;

  const lookbackMs = Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    pageCount++;
    const url = `${UPKEEP_BASE_URL}/work-orders?limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetchWithTimeout(
      url,
      { headers: { 'Session-Token': token } },
      FETCH_TIMEOUT_MS
    );
    const data: WorkOrdersResponse = await response.json();

    if (!data.success || !data.results || data.results.length === 0) break;

    const filtered = data.results.filter((wo) => {
      if (!wo.updatedAt) return true;
      let ts: number;
      if (typeof wo.updatedAt === 'number') {
        ts = wo.updatedAt > 1e12 ? wo.updatedAt : wo.updatedAt * 1000;
      } else {
        ts = new Date(wo.updatedAt).getTime();
      }
      return !isNaN(ts) && ts >= lookbackMs;
    });

    all.push(...filtered);

    if (data.results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function getTeamUserIds(token: string): Promise<Set<string>> {
  const listResponse = await fetchWithTimeout(
    `${UPKEEP_BASE_URL}/teams?name=${encodeURIComponent(TEAM_NAME)}`,
    { headers: { 'Session-Token': token } },
    FETCH_TIMEOUT_MS
  );
  const listData: TeamsListResponse = await listResponse.json();
  if (!listData.success || !listData.results || listData.results.length === 0) {
    throw new Error(`Team "${TEAM_NAME}" not found`);
  }

  const teamId = listData.results[0].id;
  const usersResponse = await fetchWithTimeout(
    `${UPKEEP_BASE_URL}/teams/${teamId}/users`,
    { headers: { 'Session-Token': token } },
    FETCH_TIMEOUT_MS
  );
  const usersData: TeamUsersResponse = await usersResponse.json();
  if (!usersData.success || !usersData.results) {
    throw new Error(`Failed to fetch users for team "${TEAM_NAME}"`);
  }

  return new Set(usersData.results.map((u) => u.id));
}

function normalizeStatus(status: string): string {
  return (status ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function computeSummary(orders: WorkOrder[]): StatusGroup[] {
  const config = [
    { name: 'Open', statusValues: ['Open'] },
    { name: 'In Progress', statusValues: ['In-Progress', 'In Progress'] },
    { name: 'On Hold', statusValues: ['On Hold', 'On-Hold'] },
    { name: 'Complete', statusValues: ['Complete', 'Closed'] },
  ];

  const normalized = orders.map((wo, i) => ({
    index: i,
    raw: wo.status,
    normalized: normalizeStatus(wo.status),
  }));

  const matchedIndexes = new Set<number>();
  const summary: StatusGroup[] = [];

  for (const group of config) {
    const targets = group.statusValues.map(normalizeStatus);
    let count = 0;
    for (const wo of normalized) {
      if (targets.includes(wo.normalized)) {
        count++;
        matchedIndexes.add(wo.index);
      }
    }
    summary.push({ name: group.name, count, statusValues: group.statusValues.join(', ') });
  }

  const otherStatuses = normalized
    .filter((wo) => !matchedIndexes.has(wo.index))
    .map((wo) => wo.raw)
    .filter(Boolean);

  const otherDistinct = [...new Set(otherStatuses)].sort();
  summary.push({
    name: 'Other',
    count: otherStatuses.length,
    statusValues: otherDistinct.length ? otherDistinct.join(', ') : 'None',
  });

  summary.push({ name: 'Total', count: orders.length, statusValues: 'All' });

  return summary;
}

function computeAging(orders: WorkOrder[]): AgingSummary {
  const candidateFields = ['createdAt', 'requestDate', 'date', 'dueDate'];
  let olderThan7 = 0, olderThan14 = 0, olderThan30 = 0;
  const now = Date.now();

  for (const wo of orders) {
    const status = normalizeStatus(wo.status);
    if (!['open', 'in-progress', 'on-hold'].includes(status)) continue;

    for (const field of candidateFields) {
      const val = (wo as unknown as Record<string, unknown>)[field];
      if (val) {
        let ts: number;
        if (typeof val === 'number') {
          ts = val > 1e12 ? val : val * 1000;
        } else {
          ts = new Date(val as string).getTime();
        }
        if (isNaN(ts)) continue;

        const days = (now - ts) / (1000 * 60 * 60 * 24);
        if (days > 7) olderThan7++;
        if (days > 14) olderThan14++;
        if (days > 30) olderThan30++;
        break;
      }
    }
  }

  return { olderThan7, olderThan14, olderThan30 };
}

function computePriority(orders: WorkOrder[]): PriorityItem[] {
  const counts: Record<string, number> = {};
  for (const wo of orders) {
    const priority = wo.priority || wo.priorityName || wo.workOrderPriority || wo.priorityLabel || 'Unspecified';
    counts[priority] = (counts[priority] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getStaticProps() {
  try {
    const email = process.env.UPKEEP_EMAIL;
    const password = process.env.UPKEEP_PASSWORD;

    if (!email || !password) {
      return {
        props: {
          data: null,
          error: 'UpKeep credentials not configured',
        },
      };
    }

    const token = await getSessionToken(email, password);
    const teamUserIds = await getTeamUserIds(token);
    const allOrders = await getAllWorkOrders(token);
    const orders = allOrders.filter((wo) => wo.assignedToUser && teamUserIds.has(wo.assignedToUser));

    const data: DashboardData = {
      summary: computeSummary(orders),
      agingSummary: computeAging(orders),
      prioritySummary: computePriority(orders),
      generatedAt: new Date().toISOString(),
      teamName: TEAM_NAME,
    };

    return {
      props: { data, error: null },
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        props: { data: null, error: 'UpKeep API request timed out. The API may be slow or unreachable from the build server.' },
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      props: { data: null, error: message },
    };
  }
}
