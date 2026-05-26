import Head from 'next/head';

interface TvData {
  openOrders: number;
  unassignedOrders: number;
  requestsUnassigned: number;
  mtdCreated: number;
  mtdCompleted: number;
  teamMembers: string[];
  teamName: string;
  generatedAt: string;
  unassignedSubjects: string[];
  pendingRequestSubjects: string[];
}

const UPKEEP_BASE_URL = 'https://api.onupkeep.com/api/v2';
const PAGE_SIZE = 200;
const INITIAL_LOOKBACK_DAYS = 60;
const FETCH_TIMEOUT_MS = 20000;
const MAX_PAGES = 5;
const TEAM_NAME = 'Weekly Team Performance Report Group';
const CACHE_FILE = 'work-orders-cache.json';
const CACHE_TTL_MS = 14 * 60 * 1000;

interface CacheEntry {
  cachedAt: string;
  orders: WorkOrder[];
}

function readCache(): { orders: WorkOrder[]; age: number } | null {
  try {
    const fs = require('fs');
    const fp = require('path').join(process.cwd(), CACHE_FILE);
    if (!fs.existsSync(fp)) return null;
    const entry: CacheEntry = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    if (age < CACHE_TTL_MS) return { orders: entry.orders, age };
    return null;
  } catch { return null; }
}

function writeCache(orders: WorkOrder[]): void {
  try {
    const fs = require('fs');
    const fp = require('path').join(process.cwd(), CACHE_FILE);
    fs.writeFileSync(fp, JSON.stringify({ cachedAt: new Date().toISOString(), orders }));
  } catch { /* ignore */ }
}

function readStaleCache(): WorkOrder[] | null {
  try {
    const fs = require('fs');
    const fp = require('path').join(process.cwd(), CACHE_FILE);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf-8')).orders;
  } catch { return null; }
}

interface WorkOrder {
  id: string;
  title?: string;
  status: string;
  assignedToUser?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  dateCompleted?: string;
}

interface TeamsListResponse {
  success: boolean;
  results?: Array<{ id: string; name: string }>;
}

interface TeamUsersResponse {
  success: boolean;
  results?: Array<{ id: string; firstName?: string; lastName?: string }>;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getSessionToken(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ email, password });
  const res = await fetchWithTimeout(`${UPKEEP_BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, FETCH_TIMEOUT_MS);
  const data = await res.json();
  if (!data.success || !data.result?.sessionToken) throw new Error('Authentication failed');
  return data.result.sessionToken;
}

async function getAllWorkOrders(token: string): Promise<WorkOrder[]> {
  const all: WorkOrder[] = [];
  let offset = 0;
  const lookbackMs = Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    pageCount++;
    const res = await fetchWithTimeout(
      `${UPKEEP_BASE_URL}/work-orders?limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: { 'Session-Token': token } },
      FETCH_TIMEOUT_MS
    );
    const data = await res.json();
    if (!data.success || !data.results || data.results.length === 0) break;

    const filtered = data.results.filter((wo: WorkOrder) => {
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

async function getTeamUserIds(token: string): Promise<{ ids: Set<string>; nameById: Record<string, string> }> {
  const res = await fetchWithTimeout(
    `${UPKEEP_BASE_URL}/teams?name=${encodeURIComponent(TEAM_NAME)}`,
    { headers: { 'Session-Token': token } },
    FETCH_TIMEOUT_MS
  );
  const listData: TeamsListResponse = await res.json();
  if (!listData.success || !listData.results || listData.results.length === 0) {
    throw new Error(`Team "${TEAM_NAME}" not found`);
  }
  const teamId = listData.results[0].id;
  const usersRes = await fetchWithTimeout(
    `${UPKEEP_BASE_URL}/teams/${teamId}/users`,
    { headers: { 'Session-Token': token } },
    FETCH_TIMEOUT_MS
  );
  const usersData: TeamUsersResponse = await usersRes.json();
  if (!usersData.success || !usersData.results) {
    throw new Error(`Failed to fetch users for team "${TEAM_NAME}"`);
  }
  const nameById: Record<string, string> = {};
  for (const u of usersData.results) {
    const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    if (fullName) nameById[u.id] = fullName;
  }
  return { ids: new Set(Object.keys(nameById)), nameById };
}

function normalizeStatus(status: string): string {
  return (status ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function safeTitle(wo: WorkOrder): string {
  if (!wo.title || wo.title.includes('elevated admin permissions')) return wo.id;
  return wo.title;
}

function parseTimestamp(val: string | number | undefined): number | null {
  if (!val) return null;
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
  const ts = new Date(val).getTime();
  return isNaN(ts) ? null : ts;
}

export async function getStaticProps(): Promise<{ props: { data: TvData | null; error: string | null } }> {
  const email = process.env.UPKEEP_EMAIL;
  const password = process.env.UPKEEP_PASSWORD;
  if (!email || !password) {
    return { props: { data: null, error: 'UpKeep credentials not configured' } };
  }

  try {
    const token = await getSessionToken(email, password);

    const cached = readCache();
    let allOrders: WorkOrder[];

    if (cached) {
      console.log(`[tv] Cache HIT (${Math.round(cached.age / 1000)}s old)`);
      allOrders = cached.orders;
    } else {
      console.log('[tv] Cache MISS — fetching from UpKeep API');
      allOrders = await getAllWorkOrders(token);
      writeCache(allOrders);
    }

    const { ids: teamUserIds, nameById } = await getTeamUserIds(token);
    const teamOrders = allOrders.filter((wo) => wo.assignedToUser && teamUserIds.has(wo.assignedToUser));

    const now = new Date();
    const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let openOrders = 0;
    let mtdCreated = 0;
    let mtdCompleted = 0;

    for (const wo of teamOrders) {
      const status = normalizeStatus(wo.status);
      if (['open', 'in-progress', 'on-hold'].includes(status)) openOrders++;

      const created = parseTimestamp(wo.createdAt);
      if (created && created >= mtdStart) mtdCreated++;

      if (status === 'complete' || status === 'closed') {
        const completed = parseTimestamp(wo.dateCompleted);
        if (completed && completed >= mtdStart) mtdCompleted++;
      }
    }

    const unassignedList = allOrders.filter((wo) => !wo.assignedToUser);
    const unassignedOrders = unassignedList.length;
    const unassignedSubjects = unassignedList.map(safeTitle).slice(0, 20);

    const pendingList = allOrders.filter((wo) => {
      const status = normalizeStatus(wo.status);
      return !wo.assignedToUser && !['complete', 'closed'].includes(status);
    });
    const requestsUnassigned = pendingList.length;
    const pendingRequestSubjects = pendingList.map(safeTitle).slice(0, 20);
    const teamMemberNames = Object.values(nameById).sort();

    const data: TvData = {
      openOrders,
      unassignedOrders,
      requestsUnassigned,
      mtdCreated,
      mtdCompleted,
      teamMembers: teamMemberNames,
      teamName: TEAM_NAME,
      generatedAt: now.toISOString(),
      unassignedSubjects,
      pendingRequestSubjects,
    };

    return { props: { data, error: null } };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { props: { data: null, error: 'UpKeep API request timed out.' } };
    }
    const staleOrders = readStaleCache();
    if (staleOrders && staleOrders.length > 0) {
      console.log('[tv] API failed — falling back to stale cache');
      try {
        const token = await getSessionToken(email, password);
        const { ids: teamUserIds, nameById } = await getTeamUserIds(token);
        const teamOrders = staleOrders.filter((wo) => wo.assignedToUser && teamUserIds.has(wo.assignedToUser));
        const now = new Date();
        const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        let openOrders = 0, mtdCreated = 0, mtdCompleted = 0;
        for (const wo of teamOrders) {
          const status = normalizeStatus(wo.status);
          if (['open', 'in-progress', 'on-hold'].includes(status)) openOrders++;
          const created = parseTimestamp(wo.createdAt);
          if (created && created >= mtdStart) mtdCreated++;
          if (status === 'complete' || status === 'closed') {
            const completed = parseTimestamp(wo.dateCompleted);
            if (completed && completed >= mtdStart) mtdCompleted++;
          }
        }
        const unassignedList = staleOrders.filter((wo) => !wo.assignedToUser);
        const pendingList = staleOrders.filter((wo) => {
          const status = normalizeStatus(wo.status);
          return !wo.assignedToUser && !['complete', 'closed'].includes(status);
        });
        const teamMemberNames = Object.values(nameById).sort();
        return {
          props: {
            data: {
              openOrders, unassignedOrders: unassignedList.length,
              requestsUnassigned: pendingList.length, mtdCreated, mtdCompleted,
              teamMembers: teamMemberNames, teamName: TEAM_NAME,
              generatedAt: now.toISOString(),
              unassignedSubjects: unassignedList.map(safeTitle).slice(0, 20),
              pendingRequestSubjects: pendingList.map(safeTitle).slice(0, 20),
            },
            error: null,
          },
        };
      } catch { /* fall through */ }
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { props: { data: null, error: message } };
  }
}

export default function TvPage({ data, error }: { data: TvData | null; error: string | null }) {
  if (error || !data) {
    return (
      <div className="tv-page">
        <div className="tv-error">{error || 'No data'}</div>
      </div>
    );
  }

  const generatedLocal = new Date(data.generatedAt).toLocaleString();

  return (
    <>
      <Head>
        <title>Team Dashboard – TV</title>
        <meta httpEquiv="refresh" content="900" />
      </Head>
      <div className="tv-page">
        <div className="tv-header">
          <div className="tv-title">
            <span className="tv-title-main">Welch Packaging · Elkhart</span>
            <span className="tv-title-sub">{data.teamName}</span>
          </div>
          <div className="tv-timestamp">{generatedLocal}</div>
        </div>

        <div className="tv-grid">
          <div className="tv-card tv-card-open">
            <div className="tv-card-number">{data.openOrders}</div>
            <div className="tv-card-label">Open Orders</div>
          </div>
          <div className="tv-card tv-card-unassigned tv-card-with-list">
            <div className="tv-card-number">{data.unassignedOrders}</div>
            <div className="tv-card-label">Unassigned Orders</div>
            <div className="tv-card-list">
              {data.unassignedSubjects.length > 0 ? (
                data.unassignedSubjects.map((s) => (
                  <div key={s} className="tv-card-list-item">{s}</div>
                ))
              ) : (
                <div className="tv-card-list-empty">None</div>
              )}
            </div>
          </div>
          <div className="tv-card tv-card-requests tv-card-with-list">
            <div className="tv-card-number">{data.requestsUnassigned}</div>
            <div className="tv-card-label">Pending Requests</div>
            <div className="tv-card-list">
              {data.pendingRequestSubjects.length > 0 ? (
                data.pendingRequestSubjects.map((s) => (
                  <div key={s} className="tv-card-list-item">{s}</div>
                ))
              ) : (
                <div className="tv-card-list-empty">None</div>
              )}
            </div>
          </div>
          <div className="tv-card tv-card-mtd">
            <div className="tv-card-number">{data.mtdCreated}</div>
            <div className="tv-card-label">MTD Created</div>
          </div>
          <div className="tv-card tv-card-complete">
            <div className="tv-card-number">{data.mtdCompleted}</div>
            <div className="tv-card-label">MTD Completed</div>
          </div>
        </div>
      </div>
    </>
  );
}
