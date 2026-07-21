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
  setSelectedOrgId: (id: string) => void;
  createWatchlist: (name: string, kind: WatchlistKind) => void;
  removeWatchlist: (id: string) => void;
  inviteMember: (email: string, role: Role) => void;
  removeMember: (membershipId: string) => void;
  createAlert: (name: string, minSeverity: Severity, channels: Channel[]) => void;
  toggleAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  acknowledgeEvent: (id: string) => void;
  /** Simulate the evaluation engine against a batch of sample signals. */
  runEvaluation: () => number;
}

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

// Sample signals used by the "Run evaluation" demo button.
const SAMPLE_SIGNALS: Array<{ severity: Severity; title: string; source: string; countries?: string[]; companies?: string[]; topics?: string[] }> = [
  { severity: 'critical', title: 'New sanctions package targets Russian energy exports', source: 'AP', countries: ['RU'], topics: ['sanctions'] },
  { severity: 'high', title: 'ASML export license under review', source: 'FT', companies: ['ASML'] },
  { severity: 'medium', title: 'Suez transit volumes down 12% w/w', source: 'Lloyd’s List', countries: ['EG'] },
  { severity: 'low', title: 'Minor port maintenance scheduled', source: 'PortWatch', countries: ['US'] },
];

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
    setSelectedOrgId,
    createWatchlist,
    removeWatchlist,
    inviteMember,
    removeMember,
    createAlert,
    toggleAlert,
    removeAlert,
    acknowledgeEvent,
    runEvaluation,
  };
}
