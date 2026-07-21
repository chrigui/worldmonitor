import { useCallback, useMemo, useState } from 'react';

// -------------------------------------------------------------------------
// Types mirror the Convex enterprise function return shapes 1:1
// (see convex/organizations.ts, memberships.ts, watchlists.ts).
// -------------------------------------------------------------------------

export type Role = 'owner' | 'admin' | 'analyst' | 'viewer';
export type WatchlistKind = 'company' | 'country' | 'topic' | 'mixed';

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  role: Role;
}

export interface Member {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: Role;
  joinedAt: number;
}

export interface PendingInvite {
  invitationId: string;
  email: string;
  role: Role;
  invitedAt: number;
}

export interface WatchlistItem {
  type: 'company' | 'country' | 'topic';
  value: string;
  label?: string;
}

export interface Watchlist {
  id: string;
  name: string;
  kind: WatchlistKind;
  items: WatchlistItem[];
  updatedAt: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  actor: string;
  at: number;
}

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Channel = 'email' | 'slack' | 'webhook' | 'in_app';

export interface AlertDef {
  id: string;
  name: string;
  minSeverity: Severity;
  channels: Channel[];
  watchlistId: string | null;
  enabled: boolean;
  updatedAt: number;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  severity: Severity;
  title: string;
  source: string | null;
  matched: string[];
  createdAt: number;
  acknowledged: boolean;
}

export type TargetType = 'slack' | 'webhook' | 'email';
export interface NotificationTarget {
  id: string;
  type: TargetType;
  target: string;
  enabled: boolean;
}

export interface CopilotCitation {
  sourceIndex: number;
  quote: string;
  title?: string;
  url?: string;
}
export interface CopilotAnswer {
  answer: string;
  citations: CopilotCitation[];
  confidence: number;
}

export type AssetType = 'supplier' | 'facility' | 'route' | 'product' | 'market' | 'other';
export type Criticality = 'tier1' | 'tier2' | 'tier3';
export interface AssetEntity { type: 'company' | 'country' | 'topic'; value: string }
export interface AssetSummary {
  id: string;
  name: string;
  type: AssetType;
  criticality: Criticality;
  revenueAtRisk: number;
  entities: AssetEntity[];
}
export interface ImpactRow {
  assetId: string;
  name: string;
  type: string;
  criticality: Criticality;
  impact: number;
  direct: boolean;
  via: string | null;
  revenueAtRisk: number;
  confidence: number;
}
export interface ImpactResult {
  rows: ImpactRow[];
  totalRevenueAtRisk: number;
  directCount: number;
  affectedCount: number;
}
interface AssetLink { fromAssetId: string; toAssetId: string; weight: number }

export interface DashboardData {
  loading: boolean;
  /** True while backed by in-memory demo data (no Convex/auth wired yet). */
  demo: boolean;
  orgs: OrgSummary[];
  selectedOrgId: string | null;
  selectedOrg: OrgSummary | null;
  members: Member[];
  pendingInvites: PendingInvite[];
  watchlists: Watchlist[];
  activity: ActivityEntry[];
  alerts: AlertDef[];
  alertEvents: AlertEvent[];
  notificationTargets: NotificationTarget[];
  setSelectedOrgId: (id: string) => void;
  createWatchlist: (name: string, kind: WatchlistKind) => void;
  removeWatchlist: (id: string) => void;
  inviteMember: (email: string, role: Role) => void;
  removeMember: (membershipId: string) => void;
  createAlert: (name: string, minSeverity: Severity, channels: Channel[]) => void;
  toggleAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  acknowledgeEvent: (id: string) => void;
  createTarget: (type: TargetType, target: string) => void;
  removeTarget: (id: string) => void;
  /** Simulate the evaluation engine against a batch of sample signals. */
  runEvaluation: () => number;
  /** Ask the AI copilot a question, grounded in the org's intelligence. */
  askCopilot: (question: string) => Promise<CopilotAnswer>;
  assets: AssetSummary[];
  impact: ImpactResult;
  createAsset: (name: string, type: AssetType, criticality: Criticality, revenueAtRisk: number, entityValue: string) => void;
  removeAsset: (id: string) => void;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 };

// Local mirror of convex/lib/impact.ts computeImpact — kept in sync; the server
// uses the authoritative version. Signals carry entity values in `topics`.
function computeImpactLocal(
  assets: AssetSummary[],
  edges: AssetLink[],
  signals: Array<{ severity: Severity; title: string; topics: string[] }>,
): ImpactResult {
  const impact = new Map<string, number>();
  const direct = new Map<string, boolean>();
  const via = new Map<string, string | null>();
  const byId = new Map(assets.map((a) => [a.id, a]));
  const norm = (s: string) => s.trim().toLowerCase();

  for (const a of assets) {
    let d = 0;
    for (const s of signals) {
      const hay = new Set(s.topics.map(norm));
      const title = norm(s.title);
      const hit = a.entities.some((e) => hay.has(norm(e.value)) || (e.type === 'topic' && title.includes(norm(e.value))));
      if (hit) d = Math.max(d, SEVERITY_WEIGHT[s.severity]);
    }
    impact.set(a.id, d); direct.set(a.id, d > 0); via.set(a.id, null);
  }
  for (let p = 0; p < Math.min(assets.length, 8); p++) {
    let changed = false;
    for (const e of edges) {
      const from = impact.get(e.fromAssetId) ?? 0;
      if (from === 0) continue;
      const cand = from * Math.max(0, Math.min(1, e.weight));
      if (cand > (impact.get(e.toAssetId) ?? 0) + 1e-9) {
        impact.set(e.toAssetId, cand);
        if (!direct.get(e.toAssetId)) via.set(e.toAssetId, byId.get(e.fromAssetId)?.name ?? null);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows: ImpactRow[] = [];
  let totalRevenueAtRisk = 0, directCount = 0;
  for (const a of assets) {
    const imp = impact.get(a.id) ?? 0;
    if (imp <= 0) continue;
    const isDirect = direct.get(a.id) ?? false;
    const rev = Math.round((a.revenueAtRisk ?? 0) * imp);
    totalRevenueAtRisk += rev;
    if (isDirect) directCount++;
    rows.push({ assetId: a.id, name: a.name, type: a.type, criticality: a.criticality, impact: imp, direct: isDirect, via: via.get(a.id) ?? null, revenueAtRisk: rev, confidence: isDirect ? 0.85 : Math.max(0.3, 0.6 * imp) });
  }
  rows.sort((x, y) => y.impact - x.impact || y.revenueAtRisk - x.revenueAtRisk);
  return { rows, totalRevenueAtRisk, directCount, affectedCount: rows.length };
}

const DEMO_ASSETS: Record<string, AssetSummary[]> = {
  org_meridian: [
    { id: 'as_tsmc', name: 'TSMC (Taiwan fab)', type: 'supplier', criticality: 'tier1', revenueAtRisk: 1200, entities: [{ type: 'company', value: 'TSM' }] },
    { id: 'as_asml', name: 'ASML', type: 'supplier', criticality: 'tier2', revenueAtRisk: 600, entities: [{ type: 'company', value: 'ASML' }] },
    { id: 'as_fab', name: 'Chip Assembly Line', type: 'product', criticality: 'tier1', revenueAtRisk: 3000, entities: [] },
    { id: 'as_redsea', name: 'Red Sea Freight Route', type: 'route', criticality: 'tier1', revenueAtRisk: 900, entities: [{ type: 'country', value: 'YE' }, { type: 'country', value: 'EG' }] },
    { id: 'as_energy', name: 'Energy Procurement', type: 'market', criticality: 'tier2', revenueAtRisk: 800, entities: [{ type: 'country', value: 'RU' }, { type: 'topic', value: 'sanctions' }] },
  ],
  org_northwind: [
    { id: 'as_port', name: 'Shanghai Port Ops', type: 'route', criticality: 'tier1', revenueAtRisk: 500, entities: [{ type: 'country', value: 'CN' }] },
  ],
};
const DEMO_LINKS: Record<string, AssetLink[]> = {
  org_meridian: [
    { fromAssetId: 'as_tsmc', toAssetId: 'as_fab', weight: 0.8 },
    { fromAssetId: 'as_asml', toAssetId: 'as_fab', weight: 0.6 },
    { fromAssetId: 'as_redsea', toAssetId: 'as_fab', weight: 0.4 },
  ],
  org_northwind: [],
};

const now = Date.now();
const mins = (n: number) => now - n * 60_000;

// -------------------------------------------------------------------------
// Demo dataset — representative of a real tenant. Swap for live Convex data
// once auth is configured (see the block at the bottom of this file).
// -------------------------------------------------------------------------

const DEMO_ORGS: OrgSummary[] = [
  { id: 'org_meridian', name: 'Meridian Capital', slug: 'meridian-capital', plan: 'enterprise', role: 'owner' },
  { id: 'org_northwind', name: 'Northwind Logistics', slug: 'northwind', plan: 'pro', role: 'admin' },
];

const DEMO_MEMBERS: Record<string, Member[]> = {
  org_meridian: [
    { membershipId: 'm1', userId: 'u1', name: 'Tarik Chrigui', email: 'tarik@chrigui.com', role: 'owner', joinedAt: mins(60 * 24 * 30) },
    { membershipId: 'm2', userId: 'u2', name: 'Elena Duarte', email: 'elena@meridian.com', role: 'admin', joinedAt: mins(60 * 24 * 12) },
    { membershipId: 'm3', userId: 'u3', name: 'Sam Okoro', email: 'sam@meridian.com', role: 'analyst', joinedAt: mins(60 * 24 * 5) },
    { membershipId: 'm4', userId: 'u4', name: 'Priya Nair', email: 'priya@meridian.com', role: 'viewer', joinedAt: mins(60 * 20) },
  ],
  org_northwind: [
    { membershipId: 'm5', userId: 'u1', name: 'Tarik Chrigui', email: 'tarik@chrigui.com', role: 'admin', joinedAt: mins(60 * 24 * 8) },
    { membershipId: 'm6', userId: 'u7', name: 'Jonas Berg', email: 'jonas@northwind.com', role: 'analyst', joinedAt: mins(60 * 30) },
  ],
};

const DEMO_WATCHLISTS: Record<string, Watchlist[]> = {
  org_meridian: [
    { id: 'w1', name: 'Semiconductor Supply', kind: 'company', updatedAt: mins(45), items: [
      { type: 'company', value: 'TSM', label: 'TSMC' },
      { type: 'company', value: 'ASML', label: 'ASML' },
      { type: 'company', value: 'NVDA', label: 'NVIDIA' },
    ] },
    { id: 'w2', name: 'Red Sea Corridor', kind: 'country', updatedAt: mins(120), items: [
      { type: 'country', value: 'EG', label: 'Egypt' },
      { type: 'country', value: 'YE', label: 'Yemen' },
      { type: 'country', value: 'SA', label: 'Saudi Arabia' },
    ] },
    { id: 'w3', name: 'Energy & Sanctions', kind: 'mixed', updatedAt: mins(8), items: [
      { type: 'topic', value: 'sanctions' },
      { type: 'country', value: 'RU', label: 'Russia' },
      { type: 'company', value: 'XOM', label: 'ExxonMobil' },
    ] },
  ],
  org_northwind: [
    { id: 'w4', name: 'Port Congestion', kind: 'country', updatedAt: mins(200), items: [
      { type: 'country', value: 'CN', label: 'China' },
      { type: 'country', value: 'US', label: 'United States' },
    ] },
  ],
};

const DEMO_INVITES: Record<string, PendingInvite[]> = {
  org_meridian: [
    { invitationId: 'i1', email: 'analyst@meridian.com', role: 'analyst', invitedAt: mins(90) },
  ],
  org_northwind: [],
};

const DEMO_ACTIVITY: Record<string, ActivityEntry[]> = {
  org_meridian: [
    { id: 'a1', action: 'watchlist.update — Energy & Sanctions', actor: 'Sam Okoro', at: mins(8) },
    { id: 'a2', action: 'watchlist.create — Semiconductor Supply', actor: 'Elena Duarte', at: mins(45) },
    { id: 'a3', action: 'invitation.create — analyst@meridian.com', actor: 'Tarik Chrigui', at: mins(90) },
    { id: 'a4', action: 'membership.updateRole — Priya Nair → viewer', actor: 'Tarik Chrigui', at: mins(60 * 20) },
  ],
  org_northwind: [
    { id: 'a5', action: 'watchlist.create — Port Congestion', actor: 'Jonas Berg', at: mins(200) },
  ],
};

const DEMO_ALERTS: Record<string, AlertDef[]> = {
  org_meridian: [
    { id: 'al1', name: 'Semiconductor disruption', minSeverity: 'high', channels: ['email', 'slack'], watchlistId: 'w1', enabled: true, updatedAt: mins(60) },
    { id: 'al2', name: 'Red Sea escalation', minSeverity: 'medium', channels: ['in_app'], watchlistId: 'w2', enabled: true, updatedAt: mins(240) },
    { id: 'al3', name: 'Any critical signal', minSeverity: 'critical', channels: ['email', 'webhook'], watchlistId: null, enabled: false, updatedAt: mins(600) },
  ],
  org_northwind: [
    { id: 'al4', name: 'Port congestion spike', minSeverity: 'medium', channels: ['email'], watchlistId: 'w4', enabled: true, updatedAt: mins(300) },
  ],
};

const DEMO_ALERT_EVENTS: Record<string, AlertEvent[]> = {
  org_meridian: [
    { id: 'ev1', alertId: 'al2', severity: 'high', title: 'Tanker rerouted after Red Sea drone incident', source: 'Reuters', matched: ['YE'], createdAt: mins(15), acknowledged: false },
    { id: 'ev2', alertId: 'al1', severity: 'high', title: 'TSMC warns of tool delivery delays', source: 'Bloomberg', matched: ['TSM'], createdAt: mins(90), acknowledged: true },
  ],
  org_northwind: [],
};

// Sample signals used by the "Run evaluation" button (demo + live).
export const SAMPLE_SIGNALS: Array<{ severity: Severity; title: string; source: string; countries?: string[]; companies?: string[]; topics?: string[] }> = [
  { severity: 'critical', title: 'New sanctions package targets Russian energy exports', source: 'AP', countries: ['RU'], topics: ['sanctions'] },
  { severity: 'high', title: 'ASML export license under review', source: 'FT', companies: ['ASML'] },
  { severity: 'medium', title: 'Suez transit volumes down 12% w/w', source: 'Lloyd’s List', countries: ['EG'] },
  { severity: 'low', title: 'Minor port maintenance scheduled', source: 'PortWatch', countries: ['US'] },
];

const DEMO_TARGETS: Record<string, NotificationTarget[]> = {
  org_meridian: [
    { id: 'nt1', type: 'slack', target: 'https://hooks.slack.com/services/T000/B000/xxxx', enabled: true },
    { id: 'nt2', type: 'email', target: 'risk-desk@meridian.com', enabled: true },
  ],
  org_northwind: [
    { id: 'nt3', type: 'webhook', target: 'https://northwind.example.com/hooks/alerts', enabled: false },
  ],
};

const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

let idc = 0;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${idc++}`;

/**
 * Dashboard data source. Currently an interactive in-memory demo so the UI is
 * fully usable without a backend. To go live, replace each field with the
 * matching Convex hook once ConvexProvider + auth are wired:
 *
 *   const orgs = useQuery(api.organizations.listMine) ?? [];
 *   const { members, pendingInvites } = useQuery(api.memberships.listForOrg, { orgId }) ?? {...};
 *   const watchlists = useQuery(api.watchlists.list, { orgId }) ?? [];
 *   const createWatchlist = useMutation(api.watchlists.create);
 *   const inviteMember = useMutation(api.memberships.invite);
 *   ...
 */
export function useDashboardData(): DashboardData {
  const [orgs] = useState<OrgSummary[]>(DEMO_ORGS);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(DEMO_ORGS[0]?.id ?? null);
  const [membersByOrg, setMembersByOrg] = useState<Record<string, Member[]>>(DEMO_MEMBERS);
  const [invitesByOrg, setInvitesByOrg] = useState<Record<string, PendingInvite[]>>(DEMO_INVITES);
  const [watchlistsByOrg, setWatchlistsByOrg] = useState<Record<string, Watchlist[]>>(DEMO_WATCHLISTS);
  const [activityByOrg, setActivityByOrg] = useState<Record<string, ActivityEntry[]>>(DEMO_ACTIVITY);
  const [alertsByOrg, setAlertsByOrg] = useState<Record<string, AlertDef[]>>(DEMO_ALERTS);
  const [eventsByOrg, setEventsByOrg] = useState<Record<string, AlertEvent[]>>(DEMO_ALERT_EVENTS);
  const [targetsByOrg, setTargetsByOrg] = useState<Record<string, NotificationTarget[]>>(DEMO_TARGETS);
  const [assetsByOrg, setAssetsByOrg] = useState<Record<string, AssetSummary[]>>(DEMO_ASSETS);

  const orgId = selectedOrgId;
  const selectedOrg = useMemo(() => orgs.find((o) => o.id === orgId) ?? null, [orgs, orgId]);

  const logActivity = useCallback((oid: string, action: string) => {
    setActivityByOrg((prev) => ({
      ...prev,
      [oid]: [{ id: nextId('a'), action, actor: 'You', at: Date.now() }, ...(prev[oid] ?? [])],
    }));
  }, []);

  const createWatchlist = useCallback((name: string, kind: WatchlistKind) => {
    if (!orgId || !name.trim()) return;
    const wl: Watchlist = { id: nextId('w'), name: name.trim(), kind, items: [], updatedAt: Date.now() };
    setWatchlistsByOrg((prev) => ({ ...prev, [orgId]: [wl, ...(prev[orgId] ?? [])] }));
    logActivity(orgId, `watchlist.create — ${wl.name}`);
  }, [orgId, logActivity]);

  const removeWatchlist = useCallback((id: string) => {
    if (!orgId) return;
    const wl = (watchlistsByOrg[orgId] ?? []).find((w) => w.id === id);
    setWatchlistsByOrg((prev) => ({ ...prev, [orgId]: (prev[orgId] ?? []).filter((w) => w.id !== id) }));
    if (wl) logActivity(orgId, `watchlist.delete — ${wl.name}`);
  }, [orgId, watchlistsByOrg, logActivity]);

  const inviteMember = useCallback((email: string, role: Role) => {
    if (!orgId || !email.trim()) return;
    const invite: PendingInvite = { invitationId: nextId('i'), email: email.trim().toLowerCase(), role, invitedAt: Date.now() };
    setInvitesByOrg((prev) => ({ ...prev, [orgId]: [invite, ...(prev[orgId] ?? [])] }));
    logActivity(orgId, `invitation.create — ${invite.email}`);
  }, [orgId, logActivity]);

  const removeMember = useCallback((membershipId: string) => {
    if (!orgId) return;
    const m = (membersByOrg[orgId] ?? []).find((x) => x.membershipId === membershipId);
    if (m?.role === 'owner' && (membersByOrg[orgId] ?? []).filter((x) => x.role === 'owner').length <= 1) return;
    setMembersByOrg((prev) => ({ ...prev, [orgId]: (prev[orgId] ?? []).filter((x) => x.membershipId !== membershipId) }));
    if (m) logActivity(orgId, `membership.remove — ${m.name ?? m.email}`);
  }, [orgId, membersByOrg, logActivity]);

  const createAlert = useCallback((name: string, minSeverity: Severity, channels: Channel[]) => {
    if (!orgId || !name.trim()) return;
    const al: AlertDef = { id: nextId('al'), name: name.trim(), minSeverity, channels, watchlistId: null, enabled: true, updatedAt: Date.now() };
    setAlertsByOrg((prev) => ({ ...prev, [orgId]: [al, ...(prev[orgId] ?? [])] }));
    logActivity(orgId, `alert.create — ${al.name}`);
  }, [orgId, logActivity]);

  const toggleAlert = useCallback((id: string) => {
    if (!orgId) return;
    setAlertsByOrg((prev) => ({
      ...prev,
      [orgId]: (prev[orgId] ?? []).map((a) => a.id === id ? { ...a, enabled: !a.enabled, updatedAt: Date.now() } : a),
    }));
  }, [orgId]);

  const removeAlert = useCallback((id: string) => {
    if (!orgId) return;
    const al = (alertsByOrg[orgId] ?? []).find((a) => a.id === id);
    setAlertsByOrg((prev) => ({ ...prev, [orgId]: (prev[orgId] ?? []).filter((a) => a.id !== id) }));
    if (al) logActivity(orgId, `alert.delete — ${al.name}`);
  }, [orgId, alertsByOrg, logActivity]);

  const acknowledgeEvent = useCallback((id: string) => {
    if (!orgId) return;
    setEventsByOrg((prev) => ({
      ...prev,
      [orgId]: (prev[orgId] ?? []).map((e) => e.id === id ? { ...e, acknowledged: true } : e),
    }));
  }, [orgId]);

  const createTarget = useCallback((type: TargetType, target: string) => {
    if (!orgId || !target.trim()) return;
    const t: NotificationTarget = { id: nextId('nt'), type, target: target.trim(), enabled: true };
    setTargetsByOrg((prev) => ({ ...prev, [orgId]: [t, ...(prev[orgId] ?? [])] }));
    logActivity(orgId, `notificationTarget.create — ${type}`);
  }, [orgId, logActivity]);

  const removeTarget = useCallback((id: string) => {
    if (!orgId) return;
    setTargetsByOrg((prev) => ({ ...prev, [orgId]: (prev[orgId] ?? []).filter((t) => t.id !== id) }));
  }, [orgId]);

  const runEvaluation = useCallback((): number => {
    if (!orgId) return 0;
    const alerts = (alertsByOrg[orgId] ?? []).filter((a) => a.enabled);
    const watchlists = watchlistsByOrg[orgId] ?? [];
    const now = Date.now();
    const created: AlertEvent[] = [];
    for (const alert of alerts) {
      const items = alert.watchlistId
        ? (watchlists.find((w) => w.id === alert.watchlistId)?.items ?? [])
        : [];
      const scope = new Set(items.map((i) => i.value.toLowerCase()));
      for (const s of SAMPLE_SIGNALS) {
        if (SEV_RANK[s.severity] < SEV_RANK[alert.minSeverity]) continue;
        const hay = new Set([...(s.countries ?? []), ...(s.companies ?? []), ...(s.topics ?? [])].map((x) => x.toLowerCase()));
        const matched = items.length === 0
          ? []
          : items.filter((i) => hay.has(i.value.toLowerCase()) || (i.type === 'topic' && s.title.toLowerCase().includes(i.value.toLowerCase()))).map((i) => i.value);
        const fires = items.length === 0 ? true : matched.length > 0;
        if (!fires) continue;
        created.push({ id: nextId('ev'), alertId: alert.id, severity: s.severity, title: s.title, source: s.source, matched, createdAt: now, acknowledged: false });
      }
    }
    if (created.length > 0) {
      setEventsByOrg((prev) => ({ ...prev, [orgId]: [...created, ...(prev[orgId] ?? [])] }));
      logActivity(orgId, `alert.evaluate — ${created.length} event${created.length === 1 ? '' : 's'}`);
    }
    return created.length;
  }, [orgId, alertsByOrg, watchlistsByOrg, logActivity]);

  const assets = orgId ? assetsByOrg[orgId] ?? [] : [];
  const impact = useMemo<ImpactResult>(() => {
    if (!orgId) return { rows: [], totalRevenueAtRisk: 0, directCount: 0, affectedCount: 0 };
    const evs = eventsByOrg[orgId] ?? [];
    const signals = evs.map((e) => ({ severity: e.severity, title: e.title, topics: e.matched }));
    return computeImpactLocal(assetsByOrg[orgId] ?? [], DEMO_LINKS[orgId] ?? [], signals);
  }, [orgId, assetsByOrg, eventsByOrg]);

  const createAsset = useCallback((name: string, type: AssetType, criticality: Criticality, revenueAtRisk: number, entityValue: string) => {
    if (!orgId || !name.trim()) return;
    const entities: AssetEntity[] = entityValue.trim() ? [{ type: 'company', value: entityValue.trim() }] : [];
    const a: AssetSummary = { id: nextId('as'), name: name.trim(), type, criticality, revenueAtRisk: revenueAtRisk || 0, entities };
    setAssetsByOrg((prev) => ({ ...prev, [orgId]: [a, ...(prev[orgId] ?? [])] }));
    logActivity(orgId, `asset.create — ${a.name}`);
  }, [orgId, logActivity]);

  const removeAsset = useCallback((id: string) => {
    if (!orgId) return;
    setAssetsByOrg((prev) => ({ ...prev, [orgId]: (prev[orgId] ?? []).filter((a) => a.id !== id) }));
  }, [orgId]);

  const askCopilot = useCallback(async (question: string): Promise<CopilotAnswer> => {
    // Local retrieval over demo evidence (alert events + watchlists). This mirrors
    // the server RAG shape; live mode calls the Convex `copilot.ask` action instead.
    const q = question.toLowerCase();
    const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const events = orgId ? eventsByOrg[orgId] ?? [] : [];
    const lists = orgId ? watchlistsByOrg[orgId] ?? [] : [];
    const sources: Array<{ index: number; title: string; text: string; url?: string }> = [];
    let i = 0;
    for (const e of events) {
      sources.push({ index: i++, title: e.title, text: `${e.severity} · ${e.source ?? ''} · ${e.matched.join(', ')}`, url: undefined });
    }
    for (const w of lists) {
      sources.push({ index: i++, title: `Watchlist: ${w.name}`, text: w.items.map((it) => it.label ?? it.value).join(', ') });
    }
    const scored = sources
      .map((s) => ({ s, hits: terms.filter((t) => (s.title + ' ' + s.text).toLowerCase().includes(t)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 4);

    await new Promise((r) => setTimeout(r, 350)); // simulate latency

    if (scored.length === 0) {
      return {
        answer: `I don't have enough evidence in this workspace to answer confidently. No recent alert events or watchlist items match "${question}". Try adding a relevant watchlist or running the evaluation engine.`,
        citations: [],
        confidence: 0.15,
      };
    }
    const citations: CopilotCitation[] = scored.map(({ s }) => ({ sourceIndex: s.index, quote: s.text, title: s.title, url: s.url }));
    const bullets = scored.map(({ s }) => `• ${s.title} — ${s.text}`).join('\n');
    return {
      answer: `Based on your current intelligence, the most relevant signals are:\n${bullets}\n\nThese indicate active exposure related to "${question}". Review the cited events and consider tightening the associated alerts.`,
      citations,
      confidence: Math.min(0.9, 0.4 + scored.length * 0.12),
    };
  }, [orgId, eventsByOrg, watchlistsByOrg]);

  return {
    loading: false,
    demo: true,
    orgs,
    selectedOrgId,
    selectedOrg,
    members: orgId ? membersByOrg[orgId] ?? [] : [],
    pendingInvites: orgId ? invitesByOrg[orgId] ?? [] : [],
    watchlists: orgId ? watchlistsByOrg[orgId] ?? [] : [],
    activity: orgId ? activityByOrg[orgId] ?? [] : [],
    alerts: orgId ? alertsByOrg[orgId] ?? [] : [],
    alertEvents: orgId ? eventsByOrg[orgId] ?? [] : [],
    notificationTargets: orgId ? targetsByOrg[orgId] ?? [] : [],
    setSelectedOrgId,
    createWatchlist,
    removeWatchlist,
    inviteMember,
    removeMember,
    createAlert,
    toggleAlert,
    removeAlert,
    acknowledgeEvent,
    createTarget,
    removeTarget,
    runEvaluation,
    askCopilot,
    assets,
    impact,
    createAsset,
    removeAsset,
  };
}
