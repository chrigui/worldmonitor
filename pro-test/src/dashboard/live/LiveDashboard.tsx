import { useEffect, useState, useRef, type ReactNode } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useQuery, useMutation, useAction } from 'convex/react';
import { anyApi } from 'convex/server';
import { SignInButton } from '@clerk/clerk-react';
import { LayoutDashboard } from 'lucide-react';
import { DashboardView } from '../Dashboard';
import type {
  DashboardData, OrgSummary, Member, PendingInvite, Watchlist, ActivityEntry,
  AlertDef, AlertEvent, NotificationTarget, CopilotAnswer, AssetSummary, ImpactResult, ReportMeta,
  EntitySummary, EntityDossier, RiskIndexData,
  WatchlistKind, Role, Severity, Channel, TargetType, AssetType, Criticality,
} from '../useDashboardData';
import { convexClient } from './convexClient';
import { SAMPLE_SIGNALS } from '../useDashboardData';

// Untyped function references — avoids a hard dependency on generated code, so
// the live path builds before `npx convex dev` has run. After codegen you may
// swap `anyApi` for the typed `api` from `convex/_generated/api`.
const api = anyApi;

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-wm-muted">
      <LayoutDashboard size={28} className="text-wm-green" />
      {children}
    </div>
  );
}

function LiveDashboardInner() {
  const upsert = useMutation(api.users.upsertFromIdentity);
  useEffect(() => { void upsert({}); }, [upsert]);

  const orgsRaw = useQuery(api.organizations.listMine) as OrgSummary[] | undefined;
  const orgs = orgsRaw ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const orgId = sel ?? orgs[0]?.id ?? null;
  const orgArg = orgId ? { orgId } : 'skip';

  const memberData = useQuery(api.memberships.listForOrg, orgArg) as
    | { members: Member[]; pendingInvites: PendingInvite[] } | undefined;
  const watchlists = (useQuery(api.watchlists.list, orgArg) as Watchlist[] | undefined) ?? [];
  const alerts = (useQuery(api.alerts.list, orgArg) as AlertDef[] | undefined) ?? [];
  const alertEvents = (useQuery(api.alerts.listEvents, orgArg) as AlertEvent[] | undefined) ?? [];
  const notificationTargets = (useQuery(api.notificationTargets.list, orgArg) as NotificationTarget[] | undefined) ?? [];
  const activity = (useQuery(api.auditLogs.listForOrg, orgArg) as ActivityEntry[] | undefined) ?? [];
  const assets = (useQuery(api.assets.list, orgArg) as AssetSummary[] | undefined) ?? [];
  const impact = (useQuery(api.assets.assess, orgArg) as ImpactResult | undefined) ?? { rows: [], totalRevenueAtRisk: 0, directCount: 0, affectedCount: 0 };
  const reports = (useQuery(api.reports.list, orgArg) as ReportMeta[] | undefined) ?? [];
  const entities = (useQuery(api.entities.list, orgArg) as EntitySummary[] | undefined) ?? [];
  const emptyRisk: RiskIndexData = { overall: 0, confidence: 0, contributingCount: 0, factors: { political: 0, economic: 0, security: 0, supplyChain: 0, cyber: 0, disaster: 0 }, drivers: { political: [], economic: [], security: [], supplyChain: [], cyber: [], disaster: [] } };
  const riskIndex = (useQuery(api.riskIndex.orgRiskIndex, orgArg) as RiskIndexData | undefined) ?? emptyRisk;

  const createWL = useMutation(api.watchlists.create);
  const removeWL = useMutation(api.watchlists.remove);
  const inviteM = useMutation(api.memberships.invite);
  const removeM = useMutation(api.memberships.remove);
  const createAl = useMutation(api.alerts.create);
  const updateAl = useMutation(api.alerts.update);
  const removeAl = useMutation(api.alerts.remove);
  const ackEv = useMutation(api.alerts.acknowledgeEvent);
  const evaluate = useMutation(api.alerts.evaluate);
  const createTargetM = useMutation(api.notificationTargets.create);
  const removeTargetM = useMutation(api.notificationTargets.remove);
  const askAction = useAction(api.copilotNode.ask);
  const copilotThread = useRef<string | null>(null);
  const createAssetM = useMutation(api.assets.create);
  const removeAssetM = useMutation(api.assets.remove);
  const generateReportAction = useAction(api.reportsNode.generate);

  const d: DashboardData = {
    loading: orgsRaw === undefined,
    demo: false,
    orgs,
    selectedOrgId: orgId,
    selectedOrg: orgs.find((o) => o.id === orgId) ?? null,
    members: memberData?.members ?? [],
    pendingInvites: memberData?.pendingInvites ?? [],
    watchlists,
    activity,
    alerts,
    alertEvents,
    notificationTargets,
    assets,
    impact,
    setSelectedOrgId: setSel,
    createWatchlist: (name: string, kind: WatchlistKind) => { if (orgId) void createWL({ orgId, name, kind }); },
    removeWatchlist: (id: string) => { void removeWL({ watchlistId: id }); },
    inviteMember: (email: string, role: Role) => { if (orgId) void inviteM({ orgId, email, role }); },
    removeMember: (membershipId: string) => { void removeM({ membershipId }); },
    createAlert: (name: string, minSeverity: Severity, channels: Channel[]) => { if (orgId) void createAl({ orgId, name, minSeverity, channels }); },
    toggleAlert: (id: string) => { const a = alerts.find((x) => x.id === id); void updateAl({ alertId: id, enabled: !(a?.enabled) }); },
    removeAlert: (id: string) => { void removeAl({ alertId: id }); },
    acknowledgeEvent: (id: string) => { void ackEv({ eventId: id }); },
    createTarget: (type: TargetType, target: string) => { if (orgId) void createTargetM({ orgId, type, target }); },
    removeTarget: (id: string) => { void removeTargetM({ targetId: id }); },
    runEvaluation: () => { if (orgId) void evaluate({ orgId, signals: SAMPLE_SIGNALS }); return 0; },
    askCopilot: async (question: string): Promise<CopilotAnswer> => {
      if (!orgId) return { answer: 'Select an organization first.', citations: [], confidence: 0 };
      const r = await askAction({ orgId, question, threadId: copilotThread.current ?? undefined }) as
        { threadId: string; answer: string; citations: CopilotAnswer['citations']; confidence: number };
      copilotThread.current = r.threadId;
      return { answer: r.answer, citations: r.citations, confidence: r.confidence };
    },
    createAsset: (name: string, type: AssetType, criticality: Criticality, revenueAtRisk: number, entityValue: string) => {
      if (!orgId) return;
      const entities = entityValue.trim() ? [{ type: 'company' as const, value: entityValue.trim() }] : [];
      void createAssetM({ orgId, name, type, criticality, revenueAtRisk, entities });
    },
    removeAsset: (id: string) => { void removeAssetM({ assetId: id }); },
    reports,
    generateReport: async (): Promise<{ title: string; html: string }> => {
      if (!orgId) return { title: 'Report', html: '<p>Select an organization.</p>' };
      const r = await generateReportAction({ orgId, days: 7 }) as { reportId: string; title: string; html: string };
      return { title: r.title, html: r.html };
    },
    entities,
    getDossier: async (value: string): Promise<EntityDossier> => {
      const empty: EntityDossier = { value, score: 0, trend: 'flat', recentCount: 0, priorCount: 0, drivers: [], watchlists: [], assets: [], sources: [] };
      if (!orgId || !convexClient) return empty;
      return (await convexClient.query(api.entities.dossier, { orgId, value })) as EntityDossier;
    },
    riskIndex,
  };

  if (orgsRaw !== undefined && orgs.length === 0) {
    return <Centered><p className="text-sm">No organizations yet. Create one to get started.</p></Centered>;
  }
  return <DashboardView data={d} />;
}

export default function LiveDashboard() {
  return (
    <>
      <AuthLoading><Centered><p className="text-sm">Connecting…</p></Centered></AuthLoading>
      <Unauthenticated>
        <Centered>
          <p className="text-sm">Sign in to access your SentinelIQ workspace.</p>
          <SignInButton mode="modal">
            <button className="bg-wm-green text-wm-bg px-4 py-2 rounded-sm font-mono text-xs uppercase tracking-wider font-bold hover:bg-green-400 transition-colors">
              Sign in
            </button>
          </SignInButton>
        </Centered>
      </Unauthenticated>
      <Authenticated><LiveDashboardInner /></Authenticated>
    </>
  );
}
