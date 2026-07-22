import { useState, lazy, Suspense, Fragment, type ReactElement } from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard, Users, ListChecks, Bell, Activity, Plus, Trash2,
  ChevronDown, ArrowLeft, ShieldCheck, Building2, Mail, Globe2, Building, Hash,
  Zap, Check, PlayCircle, Send, Slack, Webhook, Sparkles, Loader2, ExternalLink,
  Network, TrendingDown, FileText, Download, Crosshair, ArrowUp, ArrowDown, Minus, Gauge, Lock,
} from 'lucide-react';
import {
  useDashboardData, type Role, type WatchlistKind, type Watchlist, type OrgSummary,
  type Severity, type Channel, type DashboardData, type TargetType,
  type CopilotAnswer, type CopilotCitation, type AssetType, type Criticality, type ImpactResult, type AssetSummary,
  type ReportMeta, type EntitySummary, type EntityDossier, type Trend,
  type RiskIndexData, type RiskFactor, RISK_FACTOR_LIST,
} from './useDashboardData';

const FACTOR_LABEL: Record<RiskFactor, string> = {
  political: 'Political', economic: 'Economic', security: 'Security',
  supplyChain: 'Supply Chain', cyber: 'Cyber', disaster: 'Disaster',
};
function barColor(score: number): string {
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-wm-green';
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-amber-300';
  return 'text-wm-green';
}
function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === 'up') return <ArrowUp size={13} className="text-red-400" />;
  if (trend === 'down') return <ArrowDown size={13} className="text-wm-green" />;
  return <Minus size={13} className="text-wm-muted" />;
}

const TIER_STYLES: Record<Criticality, string> = {
  tier1: 'text-red-400 border-red-500/40 bg-red-500/10',
  tier2: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  tier3: 'text-wm-muted border-wm-border bg-white/5',
};

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}M`;
  return `$${n}K`;
}

const TARGET_ICON: Record<TargetType, typeof Send> = {
  slack: Slack, webhook: Webhook, email: Mail,
};
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

function WatchlistCard({ wl, onRemove }: { wl: Watchlist; onRemove: (id: string) => void }): ReactElement {
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

interface CopilotMsg { role: 'user' | 'assistant'; content: string; citations?: CopilotCitation[]; confidence?: number }

const SUGGESTED = ['What is my Red Sea exposure?', 'Summarize my top risks this week', 'Which suppliers are affected?'];

function Copilot({ ask }: { ask: (q: string) => Promise<CopilotAnswer> }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<CopilotMsg[]>([]);

  const submit = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setQ('');
    setBusy(true);
    try {
      const a = await ask(text);
      setMsgs((m) => [...m, { role: 'assistant', content: a.answer, citations: a.citations, confidence: a.confidence }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-wm-green" />
        <h2 className="font-display font-bold">AI Copilot</h2>
        <span className="text-[10px] font-mono uppercase text-wm-muted border border-wm-border rounded px-1.5 py-0.5">RAG · cited</span>
      </div>
      <div className="glass-panel flex flex-col">
        <div className="max-h-[22rem] overflow-y-auto p-4 flex flex-col gap-4">
          {msgs.length === 0 && (
            <div className="flex flex-col gap-3 text-sm text-wm-muted">
              <p>Ask about your exposure — answers are grounded in your alert events and watchlists, with citations.</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.map((s) => (
                  <button key={s} onClick={() => submit(s)} className="text-xs border border-wm-border rounded px-2.5 py-1 hover:border-wm-green/40 hover:text-wm-text transition-colors">{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-wm-green/10 border border-wm-green/30 text-wm-text' : 'bg-black/30 border border-wm-border text-wm-text'}`}>
                {m.content}
              </div>
              {m.role === 'assistant' && typeof m.confidence === 'number' && (
                <div className="flex items-center gap-2 text-[11px] text-wm-muted">
                  <span className="font-mono">confidence {(m.confidence * 100).toFixed(0)}%</span>
                  <span className="h-1 w-16 bg-white/10 rounded overflow-hidden"><span className="block h-full bg-wm-green" style={{ width: `${m.confidence * 100}%` }} /></span>
                </div>
              )}
              {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                <div className="flex flex-col gap-1 max-w-[85%]">
                  {m.citations.map((c, ci) => (
                    <div key={ci} className="flex items-start gap-1.5 text-[11px] text-wm-muted">
                      <span className="font-mono text-wm-green shrink-0">[{c.sourceIndex}]</span>
                      <span className="truncate">{c.title ?? c.quote}</span>
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-wm-blue shrink-0"><ExternalLink size={11} /></a>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-sm text-wm-muted"><Loader2 size={14} className="animate-spin text-wm-green" /> Analyzing your intelligence…</div>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="border-t border-wm-border p-2 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask the copilot…"
            className="flex-1 bg-transparent px-2 py-1.5 text-sm focus:outline-none"
          />
          <button type="submit" disabled={busy || !q.trim()} className="flex items-center gap-1 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-1.5 text-sm hover:bg-wm-green/20 transition-colors disabled:opacity-40">
            <Send size={14} /> Ask
          </button>
        </form>
      </div>
    </section>
  );
}

function BusinessImpact({ impact, assets, onCreate, onRemove }: {
  impact: ImpactResult;
  assets: AssetSummary[];
  onCreate: (name: string, type: AssetType, criticality: Criticality, revenue: number, entity: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('supplier');
  const [tier, setTier] = useState<Criticality>('tier1');
  const [revenue, setRevenue] = useState('');
  const [entity, setEntity] = useState('');
  const maxImpact = Math.max(0.01, ...impact.rows.map((r) => r.impact));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-wm-green" />
          <h2 className="font-display font-bold">Business Impact</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <TrendingDown size={15} className="text-red-400" />
          <span className="text-wm-muted">Revenue at risk</span>
          <span className="font-display font-bold text-red-400 text-glow">{money(impact.totalRevenueAtRisk)}</span>
          <span className="text-[11px] text-wm-muted">· {impact.directCount} direct / {impact.affectedCount} affected</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Impact cascade */}
        <div className="lg:col-span-2 glass-panel divide-y divide-wm-border">
          {impact.rows.map((r) => (
            <div key={r.assetId} className="p-3 flex items-center gap-3">
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 ${TIER_STYLES[r.criticality]}`}>{r.criticality}</span>
                  <span className="text-sm text-wm-text truncate">{r.name}</span>
                  <span className="text-[10px] font-mono text-wm-muted">{r.type}</span>
                  {r.direct
                    ? <span className="text-[10px] font-mono text-red-400 border border-red-500/30 rounded px-1.5 py-0.5">DIRECT</span>
                    : <span className="text-[10px] font-mono text-amber-300 border border-amber-400/30 rounded px-1.5 py-0.5">via {r.via}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 max-w-[220px] bg-white/10 rounded overflow-hidden">
                    <span className="block h-full bg-gradient-to-r from-amber-400 to-red-500" style={{ width: `${(r.impact / maxImpact) * 100}%` }} />
                  </span>
                  <span className="text-[11px] font-mono text-wm-muted">{(r.impact * 100).toFixed(0)}% · conf {(r.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
              <span className="text-sm font-display font-bold text-red-400 shrink-0">{money(r.revenueAtRisk)}</span>
            </div>
          ))}
          {impact.rows.length === 0 && (
            <div className="p-6 text-sm text-wm-muted text-center">No impact detected. Add assets mapped to your watchlist entities, then run the alert evaluation engine.</div>
          )}
        </div>

        {/* Asset registry */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">Asset registry</span>
          <form
            onSubmit={(e) => { e.preventDefault(); onCreate(name, type, tier, Number(revenue) || 0, entity); setName(''); setRevenue(''); setEntity(''); }}
            className="flex flex-col gap-2 glass-panel p-3"
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asset name…" className="bg-black/30 border border-wm-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-wm-green/50" />
            <div className="flex gap-2">
              <select value={type} onChange={(e) => setType(e.target.value as AssetType)} className="flex-1 bg-black/30 border border-wm-border rounded px-1.5 py-1.5 text-xs focus:outline-none">
                {(['supplier', 'facility', 'route', 'product', 'market', 'other'] as AssetType[]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={tier} onChange={(e) => setTier(e.target.value as Criticality)} className="bg-black/30 border border-wm-border rounded px-1.5 py-1.5 text-xs focus:outline-none">
                <option value="tier1">tier1</option><option value="tier2">tier2</option><option value="tier3">tier3</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="$K at risk" inputMode="numeric" className="flex-1 min-w-0 bg-black/30 border border-wm-border rounded px-2 py-1.5 text-xs focus:outline-none" />
              <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="entity (e.g. TSM)" className="flex-1 min-w-0 bg-black/30 border border-wm-border rounded px-2 py-1.5 text-xs focus:outline-none" />
            </div>
            <button type="submit" className="flex items-center justify-center gap-1 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-1.5 text-sm hover:bg-wm-green/20 transition-colors">
              <Plus size={14} /> Add asset
            </button>
          </form>
          <div className="glass-panel divide-y divide-wm-border max-h-52 overflow-y-auto">
            {assets.map((a) => (
              <div key={a.id} className="p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[9px] font-mono uppercase border rounded px-1 py-0.5 ${TIER_STYLES[a.criticality]}`}>{a.criticality}</span>
                  <span className="text-xs truncate">{a.name}</span>
                </div>
                <button onClick={() => onRemove(a.id)} className="text-wm-muted hover:text-red-400 shrink-0" aria-label="Remove asset"><Trash2 size={13} /></button>
              </div>
            ))}
            {assets.length === 0 && <div className="p-3 text-xs text-wm-muted">No assets yet.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function downloadFile(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Compliance({ settings, onUpdate, onExport }: {
  settings: DashboardData['orgSettings'];
  onUpdate: DashboardData['updateOrgSettings'];
  onExport: DashboardData['exportAuditLog'];
}) {
  const [audit, setAudit] = useState(String(settings.auditRetentionDays));
  const [events, setEvents] = useState(String(settings.eventRetentionDays));
  const [busy, setBusy] = useState(false);
  const dirty = Number(audit) !== settings.auditRetentionDays || Number(events) !== settings.eventRetentionDays;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-wm-green" />
        <h2 className="font-display font-bold">Compliance &amp; Audit</h2>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Retention + SSO */}
        <div className="glass-panel p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">Data retention</span>
            <label className="flex items-center justify-between text-sm">
              <span className="text-wm-muted">Audit log (days)</span>
              <input value={audit} onChange={(e) => setAudit(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-24 bg-black/30 border border-wm-border rounded px-2 py-1 text-right focus:outline-none focus:border-wm-green/50" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-wm-muted">Alert events (days)</span>
              <input value={events} onChange={(e) => setEvents(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-24 bg-black/30 border border-wm-border rounded px-2 py-1 text-right focus:outline-none focus:border-wm-green/50" />
            </label>
            <button
              onClick={() => onUpdate({ auditRetentionDays: Number(audit) || 365, eventRetentionDays: Number(events) || 90 })}
              disabled={!dirty}
              className="self-end mt-1 flex items-center gap-1 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-1.5 text-sm hover:bg-wm-green/20 transition-colors disabled:opacity-40"
            >
              <Check size={14} /> Save
            </button>
          </div>
          <div className="border-t border-wm-border pt-3 flex items-start gap-2">
            <Lock size={15} className="text-wm-green mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Enterprise SSO / SAML</span>
              <span className="text-[11px] text-wm-muted">
                {settings.requireSso ? 'Required for all members.' : 'Configure a SAML connection in Clerk (Organizations → SSO) and enforce it here.'}
              </span>
            </div>
          </div>
        </div>

        {/* Audit export */}
        <div className="glass-panel p-4 flex flex-col gap-3">
          <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">Audit export</span>
          <p className="text-sm text-wm-muted">Export the immutable audit trail (who did what, when) as CSV for compliance and SIEM ingestion.</p>
          <button
            onClick={async () => { setBusy(true); try { const f = await onExport(); if (f.content) downloadFile(f.filename, f.content); } finally { setBusy(false); } }}
            disabled={busy}
            className="self-start flex items-center gap-1.5 border border-wm-border rounded px-3 py-1.5 text-sm text-wm-muted hover:text-wm-green hover:border-wm-green/40 transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export audit log (CSV)
          </button>
        </div>
      </div>
    </section>
  );
}

function openReportHtml(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Reports({ reports, onGenerate }: { reports: ReportMeta[]; onGenerate: () => Promise<{ title: string; html: string }> }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-wm-green" />
          <h2 className="font-display font-bold">Executive Reports</h2>
        </div>
        <button
          onClick={async () => { setBusy(true); try { const r = await onGenerate(); openReportHtml(r.html); } finally { setBusy(false); } }}
          disabled={busy}
          className="flex items-center gap-1.5 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-1.5 text-sm hover:bg-wm-green/20 transition-colors disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Generate brief
        </button>
      </div>
      <div className="glass-panel divide-y divide-wm-border">
        {reports.map((r) => (
          <div key={r.id} className="p-3 flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-wm-text truncate">{r.title}</span>
              <span className="text-[11px] text-wm-muted">
                {new Date(r.createdAt).toISOString().slice(0, 10)} · {r.eventCount} events · <span className="text-red-400">{money(r.totalRevenueAtRisk)}</span> at risk
                <span className="ml-1.5 font-mono uppercase text-[9px] border border-wm-border rounded px-1 py-0.5">{r.source}</span>
              </span>
            </div>
            <Download size={14} className="text-wm-muted shrink-0" />
          </div>
        ))}
        {reports.length === 0 && <div className="p-4 text-sm text-wm-muted">No reports yet — generate an executive brief.</div>}
      </div>
    </section>
  );
}

function EntityDossiers({ entities, getDossier }: { entities: EntitySummary[]; getDossier: (v: string) => Promise<EntityDossier> }) {
  const [selected, setSelected] = useState<EntityDossier | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async (value: string) => {
    setLoading(true);
    try { setSelected(await getDossier(value)); } finally { setLoading(false); }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Crosshair size={16} className="text-wm-green" />
        <h2 className="font-display font-bold">Entity Dossiers</h2>
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Directory */}
        <div className="glass-panel divide-y divide-wm-border max-h-96 overflow-y-auto">
          {entities.map((e) => (
            <button key={e.value} onClick={() => open(e.value)}
              className={`w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors ${selected?.value === e.value ? 'bg-white/[0.04]' : ''}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono uppercase text-wm-muted border border-wm-border rounded px-1.5 py-0.5">{e.type}</span>
                <span className="text-sm truncate">{e.value}</span>
              </div>
              <span className="flex items-center gap-1.5 shrink-0">
                <TrendIcon trend={e.trend} />
                <span className={`font-display font-bold text-sm ${scoreColor(e.score)}`}>{e.score}</span>
              </span>
            </button>
          ))}
          {entities.length === 0 && <div className="p-4 text-sm text-wm-muted">No tracked entities yet — add watchlists or assets.</div>}
        </div>

        {/* Dossier detail */}
        <div className="lg:col-span-2 glass-panel p-4 min-h-[12rem]">
          {loading && <div className="flex items-center gap-2 text-sm text-wm-muted"><Loader2 size={14} className="animate-spin text-wm-green" /> Building dossier…</div>}
          {!loading && !selected && <div className="text-sm text-wm-muted flex items-center h-full">Select an entity to view its risk dossier.</div>}
          {!loading && selected && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-display font-bold text-lg">{selected.value}</span>
                  <span className="flex items-center gap-1"><TrendIcon trend={selected.trend} /><span className="text-xs text-wm-muted font-mono">{selected.trend}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-display font-bold text-3xl ${scoreColor(selected.score)} text-glow`}>{selected.score}</span>
                  <span className="text-xs text-wm-muted">risk score</span>
                </div>
              </div>
              <div className="text-[11px] text-wm-muted font-mono">{selected.recentCount} events this week · {selected.priorCount} prior week</div>

              {selected.assets.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">Exposed assets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.assets.map((a, i) => (
                      <span key={i} className="text-xs border border-wm-border rounded px-2 py-0.5">{a.name} <span className="text-red-400">{money(a.revenueAtRisk)}</span></span>
                    ))}
                  </div>
                </div>
              )}
              {selected.watchlists.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">On watchlists</span>
                  <div className="flex flex-wrap gap-1.5">{selected.watchlists.map((w, i) => <span key={i} className="text-xs text-wm-green border border-wm-green/30 rounded px-2 py-0.5">{w}</span>)}</div>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">Risk drivers</span>
                <div className="flex flex-col gap-1.5">
                  {selected.drivers.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 mt-0.5 shrink-0 ${SEVERITY_STYLES[d.severity]}`}>{d.severity}</span>
                      <span className="text-wm-text">{d.title}{d.source && <span className="text-wm-muted"> — {d.source}</span>}</span>
                    </div>
                  ))}
                  {selected.drivers.length === 0 && <span className="text-sm text-wm-muted">No recent events for this entity.</span>}
                </div>
              </div>
              {selected.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.sources.map((s, i) => (
                    s.url
                      ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-wm-blue border border-wm-border rounded px-2 py-0.5 flex items-center gap-1">{s.name}<ExternalLink size={10} /></a>
                      : <span key={i} className="text-[11px] text-wm-muted border border-wm-border rounded px-2 py-0.5">{s.name}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RiskIndexPanel({ risk }: { risk: RiskIndexData }) {
  const topFactor = RISK_FACTOR_LIST.reduce((a, b) => (risk.factors[b] > risk.factors[a] ? b : a), 'security' as RiskFactor);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Gauge size={16} className="text-wm-green" />
        <h2 className="font-display font-bold">Risk Index</h2>
        <span className="text-[10px] font-mono uppercase text-wm-muted border border-wm-border rounded px-1.5 py-0.5">multi-factor</span>
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Overall */}
        <div className="glass-panel p-5 flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-[11px] uppercase tracking-widest text-wm-muted font-mono">Overall Risk</span>
          <span className={`font-display font-bold text-6xl text-glow ${scoreColor(risk.overall)}`}>{risk.overall}</span>
          <span className="text-xs text-wm-muted">/ 100</span>
          <div className="flex items-center gap-2 text-[11px] text-wm-muted mt-1">
            <span className="font-mono">confidence {(risk.confidence * 100).toFixed(0)}%</span>
            <span>· {risk.contributingCount} signals</span>
          </div>
        </div>
        {/* Factor breakdown */}
        <div className="lg:col-span-2 glass-panel p-4 flex flex-col gap-3">
          {RISK_FACTOR_LIST.map((f) => (
            <div key={f} className="flex items-center gap-3">
              <span className="text-sm w-28 shrink-0 text-wm-muted">{FACTOR_LABEL[f]}</span>
              <span className="h-2 flex-1 bg-white/10 rounded overflow-hidden">
                <span className={`block h-full ${barColor(risk.factors[f])} transition-all`} style={{ width: `${risk.factors[f]}%` }} />
              </span>
              <span className={`font-mono text-sm w-8 text-right ${scoreColor(risk.factors[f])}`}>{risk.factors[f]}</span>
            </div>
          ))}
        </div>
      </div>
      {risk.drivers[topFactor].length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-wm-muted font-mono">Top {FACTOR_LABEL[topFactor]} drivers</span>
          <div className="flex flex-col gap-1">
            {risk.drivers[topFactor].map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 mt-0.5 shrink-0 ${SEVERITY_STYLES[d.severity]}`}>{d.severity}</span>
                <span className="text-wm-text">{d.title}{d.source && <span className="text-wm-muted"> — {d.source}</span>}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
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
  const [targetType, setTargetType] = useState<TargetType>('slack');
  const [targetValue, setTargetValue] = useState('');

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

        <RiskIndexPanel risk={d.riskIndex} />

        <Copilot ask={d.askCopilot} />

        <BusinessImpact impact={d.impact} assets={d.assets} onCreate={d.createAsset} onRemove={d.removeAsset} />

        <Reports reports={d.reports} onGenerate={d.generateReport} />

        <EntityDossiers entities={d.entities} getDossier={d.getDossier} />

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
                <Fragment key={wl.id}><WatchlistCard wl={wl} onRemove={d.removeWatchlist} /></Fragment>
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

          {/* Delivery channels */}
          <div className="flex flex-col gap-2 mt-1">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-wm-muted font-mono">
              <Send size={12} className="text-wm-green" /> Delivery channels
            </span>
            <form
              onSubmit={(e) => { e.preventDefault(); d.createTarget(targetType, targetValue); setTargetValue(''); }}
              className="flex gap-2 flex-wrap"
            >
              <select value={targetType} onChange={(e) => setTargetType(e.target.value as TargetType)}
                className="bg-black/30 border border-wm-border rounded px-2 py-2 text-sm focus:outline-none focus:border-wm-green/50">
                <option value="slack">Slack</option>
                <option value="webhook">Webhook</option>
                <option value="email">Email</option>
              </select>
              <input
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder={targetType === 'email' ? 'alerts@company.com' : 'https://…'}
                className="flex-1 min-w-[200px] bg-black/30 border border-wm-border rounded px-3 py-2 text-sm focus:outline-none focus:border-wm-green/50"
              />
              <button type="submit" className="flex items-center gap-1 bg-wm-green/10 border border-wm-green/40 text-wm-green rounded px-3 py-2 text-sm hover:bg-wm-green/20 transition-colors">
                <Plus size={14} /> Add channel
              </button>
            </form>
            <div className="glass-panel divide-y divide-wm-border">
              {d.notificationTargets.map((tg) => {
                const Icon = TARGET_ICON[tg.type];
                return (
                  <div key={tg.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon size={15} className={tg.enabled ? 'text-wm-green' : 'text-wm-muted'} />
                      <span className="text-[10px] font-mono uppercase text-wm-muted border border-wm-border rounded px-1.5 py-0.5">{tg.type}</span>
                      <span className={`text-sm truncate font-mono ${tg.enabled ? 'text-wm-text' : 'text-wm-muted line-through'}`}>{tg.target}</span>
                    </div>
                    <button onClick={() => d.removeTarget(tg.id)} className="text-wm-muted hover:text-red-400 shrink-0" aria-label="Remove channel">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              {d.notificationTargets.length === 0 && <div className="p-4 text-sm text-wm-muted">No delivery channels — alerts show in-app only.</div>}
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

        <Compliance settings={d.orgSettings} onUpdate={d.updateOrgSettings} onExport={d.exportAuditLog} />
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
