import { useState, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard, Users, ListChecks, Bell, Activity, Plus, Trash2,
  ChevronDown, ArrowLeft, ShieldCheck, Building2, Mail, Globe2, Building, Hash,
  Zap, Check, PlayCircle,
} from 'lucide-react';
import {
  useDashboardData, type Role, type WatchlistKind, type Watchlist, type OrgSummary,
  type Severity, type Channel, type DashboardData,
} from './useDashboardData';
import { LIVE_MODE } from './live/convexClient';

const LiveDashboard = lazy(() => import('./live/LiveDashboard'));

const SEVERITY_STYLES: Record<Severity, string> = {
  low: 'text-wm-muted border-wm-border bg-white/5',
  medium: 'text-wm-blue border-wm-blue/40 bg-wm-blue/10',
  high: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  critical: 'text-red-400 border-red-500/40 bg-red-500/10',
};

const ROLE_STYLES: Record<Role, string> = {
  owner: 'text-wm-green border-wm-green/40 bg-wm-green/10',
  admin: 'text-wm-blue border-wm-blue/40 bg-wm-blue/10',
  analyst: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  viewer: 'text-wm-muted border-wm-border bg-white/5',
};

const KIND_ICON: Record<WatchlistKind, typeof Globe2> = {
  company: Building, country: Globe2, topic: Hash, mixed: ListChecks,
};

function relTime(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function Tile({ icon: Icon, label, value, accent }: {
  icon: typeof Users; label: string; value: number | string; accent?: boolean;
}) {
  return (
    <div className="glass-panel p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-wm-muted font-mono">{label}</span>
        <Icon size={16} className={accent ? 'text-wm-green' : 'text-wm-muted'} />
      </div>
      <span className={`text-3xl font-display font-bold ${accent ? 'text-wm-green text-glow' : 'text-wm-text'}`}>{value}</span>
    </div>
  );
}

function OrgSwitcher({ orgs, selectedOrg, onSelect }: {
  orgs: OrgSummary[]; selectedOrg: OrgSummary | null; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!selectedOrg) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 glass-panel px-3 py-2 text-sm hover:border-wm-green/40 transition-colors"
      >
        <Building2 size={16} className="text-wm-green" />
        <span className="font-medium">{selectedOrg.name}</span>
        <span className="text-[10px] uppercase font-mono text-wm-muted border border-wm-border rounded px-1.5 py-0.5">{selectedOrg.plan}</span>
        <ChevronDown size={14} className="text-wm-muted" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 glass-panel p-1">
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => { onSelect(o.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-white/5 flex items-center justify-between ${o.id === selectedOrg.id ? 'text-wm-green' : 'text-wm-text'}`}
            >
              <span>{o.name}</span>
              <span className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 ${ROLE_STYLES[o.role]}`}>{o.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WatchlistCard({ wl, onRemove }: { wl: Watchlist; onRemove: (id: string) => void }) {
  const Icon = KIND_ICON[wl.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-4 flex flex-col gap-3 group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-wm-green" />
          <span className="font-medium">{wl.name}</span>
        </div>
        <button
          onClick={() => onRemove(wl.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-wm-muted hover:text-red-400"
          aria-label="Delete watchlist"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {wl.items.length === 0 && <span className="text-xs text-wm-muted">No items yet</span>}
        {wl.items.map((it, i) => (
          <span key={i} className="text-[11px] font-mono px-2 py-0.5 rounded border border-wm-border bg-black/30 text-wm-muted">
            {it.label ?? it.value}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-wm-muted font-mono">
        <span className="uppercase tracking-wider">{wl.kind}</span>
        <span>updated {relTime(wl.updatedAt)}</span>
      </div>
    </motion.div>
  );
}

export function DashboardView({ data }: { data?: DashboardData }) {
  const demoData = useDashboardData();
  const d = data ?? demoData;
  const [wlName, setWlName] = useState('');
  const [wlKind, setWlKind] = useState<WatchlistKind>('company');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('analyst');
  const [alertName, setAlertName] = useState('');
  const [alertSev, setAlertSev] = useState<Severity>('high');
  const [alertChannel, setAlertChannel] = useState<Channel>('email');
  const [evalMsg, setEvalMsg] = useState<string | null>(null);

  const trackedEntities = d.watchlists.reduce((n, w) => n + w.items.length, 0);
  const openEvents = d.alertEvents.filter((e) => !e.acknowledged).length;

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-wm-border sticky top-0 z-30 bg-wm-bg/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = ''; }}
               className="text-wm-muted hover:text-wm-text transition-colors flex items-center gap-1 text-sm">
              <ArrowLeft size={16} /> <span className="hidden sm:inline">Site</span>
            </a>
            <div className="flex items-center gap-2 text-wm-green font-display font-bold">
              <LayoutDashboard size={18} /> SentinelIQ
            </div>
          </div>
          <OrgSwitcher orgs={d.orgs} selectedOrg={d.selectedOrg} onSelect={d.setSelectedOrgId} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {d.demo && (
          <div className="flex items-center gap-2 text-xs text-amber-300/90 border border-amber-400/30 bg-amber-400/5 rounded px-3 py-2">
            <ShieldCheck size={14} />
            Demo data — connect Convex + auth to go live (see convex/organizations.ts, memberships.ts, watchlists.ts).
          </div>
        )}

        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={ListChecks} label="Watchlists" value={d.watchlists.length} accent />
          <Tile icon={Users} label="Members" value={d.members.length} />
          <Tile icon={Bell} label="Open Alerts" value={openEvents} accent={openEvents > 0} />
          <Tile icon={Globe2} label="Tracked Entities" value={trackedEntities} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Watchlists */}
          <section className="lg:col-span-2 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ListChecks size={16} className="text-wm-green" />
              <h2 className="font-display font-bold">Watchlists</h2>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); d.createWatchlist(wlName, wlKind); setWlName(''); }}
              className="flex gap-2 flex-wrap"
            >
              <input
                value={wlName}
                onChange={(e) => setWlName(e.target.value)}
                placeholder="New watchlist name…"
                className="flex-1 min-w-[160px] bg-black/30 border border-wm-border rounded px-3 py-2 text-sm focus:outline-none focus:border-wm-green/50"
              />
              <select
                value={wlKind}
                onChange={(e) => setWlKind(e.target.value as WatchlistKind)}
                className="bg-black/30 border border-wm-border rounded px-2 py-2 text-sm focus:outline-none focus:border-wm-green/50"
              >
                <option value="company">Company</option>
                <option value="country">Country</option>
                <option value="topic">Topic</option>
                <option value="mixed">Mixed</option>
              </select>
              <button type="submit" className="flex items-center gap-1 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-2 text-sm hover:bg-wm-green/20 transition-colors">
                <Plus size={14} /> Add
              </button>
            </form>
            <div className="grid sm:grid-cols-2 gap-3">
              {d.watchlists.map((wl) => (
                <WatchlistCard key={wl.id} wl={wl} onRemove={d.removeWatchlist} />
              ))}
              {d.watchlists.length === 0 && (
                <div className="text-sm text-wm-muted glass-panel p-6 text-center sm:col-span-2">No watchlists yet — create one above.</div>
              )}
            </div>
          </section>

          {/* Activity */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-wm-green" />
              <h2 className="font-display font-bold">Recent Activity</h2>
            </div>
            <div className="glass-panel divide-y divide-wm-border">
              {d.activity.slice(0, 8).map((a) => (
                <div key={a.id} className="p-3 flex flex-col gap-0.5">
                  <span className="text-sm text-wm-text font-mono">{a.action}</span>
                  <span className="text-[11px] text-wm-muted">{a.actor} · {relTime(a.at)}</span>
                </div>
              ))}
              {d.activity.length === 0 && <div className="p-4 text-sm text-wm-muted">No activity yet.</div>}
            </div>
          </section>
        </div>

        {/* Alerts */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-wm-green" />
              <h2 className="font-display font-bold">Alerts</h2>
            </div>
            <button
              onClick={() => {
                const n = d.runEvaluation();
                setEvalMsg(!d.demo ? 'Evaluation triggered' : n > 0 ? `Engine fired ${n} event${n === 1 ? '' : 's'}` : 'No signals matched');
                window.setTimeout(() => setEvalMsg(null), 4000);
              }}
              className="flex items-center gap-1.5 text-xs font-mono border border-wm-border rounded px-3 py-1.5 text-wm-muted hover:text-wm-green hover:border-wm-green/40 transition-colors"
            >
              <PlayCircle size={14} /> Run evaluation
              {evalMsg && <span className="text-wm-green ml-1">· {evalMsg}</span>}
            </button>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); d.createAlert(alertName, alertSev, [alertChannel]); setAlertName(''); }}
            className="flex gap-2 flex-wrap"
          >
            <input
              value={alertName}
              onChange={(e) => setAlertName(e.target.value)}
              placeholder="New alert name…"
              className="flex-1 min-w-[160px] bg-black/30 border border-wm-border rounded px-3 py-2 text-sm focus:outline-none focus:border-wm-green/50"
            />
            <select value={alertSev} onChange={(e) => setAlertSev(e.target.value as Severity)}
              className="bg-black/30 border border-wm-border rounded px-2 py-2 text-sm focus:outline-none focus:border-wm-green/50">
              <option value="low">Low+</option>
              <option value="medium">Medium+</option>
              <option value="high">High+</option>
              <option value="critical">Critical</option>
            </select>
            <select value={alertChannel} onChange={(e) => setAlertChannel(e.target.value as Channel)}
              className="bg-black/30 border border-wm-border rounded px-2 py-2 text-sm focus:outline-none focus:border-wm-green/50">
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
              <option value="in_app">In-app</option>
            </select>
            <button type="submit" className="flex items-center gap-1 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-2 text-sm hover:bg-wm-green/20 transition-colors">
              <Plus size={14} /> Add
            </button>
          </form>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Alert definitions */}
            <div className="glass-panel divide-y divide-wm-border">
              {d.alerts.map((a) => (
                <div key={a.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => d.toggleAlert(a.id)}
                      className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${a.enabled ? 'bg-wm-green/30' : 'bg-white/10'}`}
                      aria-label="Toggle alert"
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${a.enabled ? 'left-4 bg-wm-green' : 'left-0.5 bg-wm-muted'}`} />
                    </button>
                    <div className="flex flex-col min-w-0">
                      <span className={`text-sm truncate ${a.enabled ? 'text-wm-text' : 'text-wm-muted'}`}>{a.name}</span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 ${SEVERITY_STYLES[a.minSeverity]}`}>{a.minSeverity}+</span>
                        {a.channels.map((c) => (
                          <span key={c} className="text-[10px] font-mono text-wm-muted border border-wm-border rounded px-1.5 py-0.5">{c}</span>
                        ))}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => d.removeAlert(a.id)} className="text-wm-muted hover:text-red-400 shrink-0" aria-label="Delete alert">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {d.alerts.length === 0 && <div className="p-4 text-sm text-wm-muted">No alerts configured.</div>}
            </div>

            {/* Live alert feed */}
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-wm-muted font-mono">
                <Zap size={12} className="text-wm-green" /> Live alert feed
              </span>
              <div className="glass-panel divide-y divide-wm-border">
                {d.alertEvents.slice(0, 8).map((ev) => (
                  <div key={ev.id} className={`p-3 flex items-start justify-between gap-3 ${ev.acknowledged ? 'opacity-50' : ''}`}>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 ${SEVERITY_STYLES[ev.severity]}`}>{ev.severity}</span>
                        <span className="text-sm text-wm-text truncate">{ev.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ev.source && <span className="text-[11px] text-wm-muted">{ev.source} · {relTime(ev.createdAt)}</span>}
                        {ev.matched.map((m) => (
                          <span key={m} className="text-[10px] font-mono text-wm-green border border-wm-green/30 rounded px-1.5 py-0.5">{m}</span>
                        ))}
                      </div>
                    </div>
                    {!ev.acknowledged && (
                      <button onClick={() => d.acknowledgeEvent(ev.id)} className="shrink-0 text-wm-muted hover:text-wm-green" aria-label="Acknowledge">
                        <Check size={15} />
                      </button>
                    )}
                  </div>
                ))}
                {d.alertEvents.length === 0 && <div className="p-4 text-sm text-wm-muted">No alert events yet — run the evaluation engine.</div>}
              </div>
            </div>
          </div>
        </section>

        {/* Members */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-wm-green" />
            <h2 className="font-display font-bold">Members &amp; Access</h2>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); d.inviteMember(inviteEmail, inviteRole); setInviteEmail(''); }}
            className="flex gap-2 flex-wrap"
          >
            <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-black/30 border border-wm-border rounded px-3">
              <Mail size={14} className="text-wm-muted" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Invite by email…"
                className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="bg-black/30 border border-wm-border rounded px-2 py-2 text-sm focus:outline-none focus:border-wm-green/50"
            >
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit" className="flex items-center gap-1 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-2 text-sm hover:bg-wm-green/20 transition-colors">
              <Plus size={14} /> Invite
            </button>
          </form>

          <div className="glass-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-wm-muted font-mono border-b border-wm-border">
                  <th className="px-4 py-2 font-normal">Member</th>
                  <th className="px-4 py-2 font-normal hidden sm:table-cell">Role</th>
                  <th className="px-4 py-2 font-normal hidden md:table-cell">Joined</th>
                  <th className="px-4 py-2 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.membershipId} className="border-b border-wm-border/60 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-wm-green/10 border border-wm-green/30 text-wm-green flex items-center justify-center text-xs font-bold">{initials(m.name, m.email)}</span>
                        <div className="flex flex-col">
                          <span className="text-wm-text">{m.name ?? m.email}</span>
                          <span className="text-[11px] text-wm-muted">{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-[11px] font-mono uppercase border rounded px-2 py-0.5 ${ROLE_STYLES[m.role]}`}>{m.role}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-wm-muted text-[13px]">{relTime(m.joinedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => d.removeMember(m.membershipId)}
                        disabled={m.role === 'owner'}
                        className="text-wm-muted hover:text-red-400 disabled:opacity-30 disabled:hover:text-wm-muted transition-colors"
                        aria-label="Remove member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.pendingInvites.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">Pending invitations</span>
              {d.pendingInvites.map((inv) => (
                <div key={inv.invitationId} className="flex items-center justify-between glass-panel px-4 py-2 text-sm">
                  <span className="flex items-center gap-2"><Mail size={13} className="text-wm-muted" /> {inv.email}</span>
                  <span className={`text-[11px] font-mono uppercase border rounded px-2 py-0.5 ${ROLE_STYLES[inv.role]}`}>{inv.role}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/**
 * Dashboard entry point. Renders the live, Convex-backed dashboard when
 * VITE_CONVEX_URL + VITE_CLERK_PUBLISHABLE_KEY are configured, otherwise the
 * fully-interactive demo. Both render the same DashboardView.
 */
export default function Dashboard() {
  if (LIVE_MODE) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-wm-muted text-sm">Loading…</div>}>
        <LiveDashboard />
      </Suspense>
    );
  }
  return <DashboardView />;
}
