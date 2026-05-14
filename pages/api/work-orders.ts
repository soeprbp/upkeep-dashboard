import type { NextApiRequest, NextApiResponse } from 'next';

const UPKEEP_BASE_URL = 'https://api.onupkeep.com/api/v2';
const PAGE_SIZE = 200;

interface WorkOrder {
  id: string;
  status: string;
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

interface AuthResponse {
  success: boolean;
  result?: { sessionToken: string };
}

interface WorkOrdersResponse {
  success: boolean;
  results?: WorkOrder[];
}

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

async function getSessionToken(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ email, password });
  const response = await fetch(`${UPKEEP_BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data: AuthResponse = await response.json();
  if (!data.success || !data.result?.sessionToken) {
    throw new Error('Authentication failed');
  }
  return data.result.sessionToken;
}

async function getAllWorkOrders(token: string): Promise<WorkOrder[]> {
  const all: WorkOrder[] = [];
  let offset = 0;

  while (true) {
    const url = `${UPKEEP_BASE_URL}/work-orders?limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: { 'Session-Token': token },
    });
    const data: WorkOrdersResponse = await response.json();

    if (!data.success || !data.results || data.results.length === 0) break;

    all.push(...data.results);

    if (data.results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardData | { error: string }>
) {
  try {
    const email = process.env.UPKEEP_EMAIL;
    const password = process.env.UPKEEP_PASSWORD;

    if (!email || !password) {
      return res.status(500).json({ error: 'UpKeep credentials not configured' });
    }

    const token = await getSessionToken(email, password);
    const orders = await getAllWorkOrders(token);

    const data: DashboardData = {
      summary: computeSummary(orders),
      agingSummary: computeAging(orders),
      prioritySummary: computePriority(orders),
      generatedAt: new Date().toISOString(),
    };

    res.status(200).json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
