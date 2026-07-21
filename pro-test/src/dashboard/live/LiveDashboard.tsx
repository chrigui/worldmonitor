import { useEffect, useState, type ReactNode } from 'react';
import { Authenticated, Unauthenticated, AuthLoading, useQuery, useMutation } from 'convex/react';
import { anyApi } from 'convex/server';
import { SignInButton } from '@clerk/clerk-react';
import { LayoutDashboard } from 'lucide-react';
import { DashboardView } from '../Dashboard';
import type {
  DashboardData, OrgSummary, Member, PendingInvite, Watchlist, ActivityEntry,
  AlertDef, AlertEvent, WatchlistKind, Role, Severity, Channel,
} from '../useDashboardData';
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
  const activity = (useQuery(api.auditLogs.listForOrg, orgArg) as ActivityEntry[] | undefined) ?? [];

  const createWL = useMutation(api.watchlists.create);
  const removeWL = useMutation(api.watchlists.remove);
  const inviteM = useMutation(api.memberships.invite);
  const removeM = useMutation(api.memberships.remove);
  const createAl = useMutation(api.alerts.create);
  const updateAl = useMutation(api.alerts.update);
  const removeAl = useMutation(api.alerts.remove);
  const ackEv = useMutation(api.alerts.acknowledgeEvent);
  const evaluate = useMutation(api.alerts.evaluate);

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
    setSelectedOrgId: setSel,
    createWatchlist: (name: string, kind: WatchlistKind) => { if (orgId) void createWL({ orgId, name, kind }); },
    removeWatchlist: (id: string) => { void removeWL({ watchlistId: id }); },
    inviteMember: (email: string, role: Role) => { if (orgId) void inviteM({ orgId, email, role }); },
    removeMember: (membershipId: string) => { void removeM({ membershipId }); },
    createAlert: (name: string, minSeverity: Severity, channels: Channel[]) => { if (orgId) void createAl({ orgId, name, minSeverity, channels }); },
    toggleAlert: (id: string) => { const a = alerts.find((x) => x.id === id); void updateAl({ alertId: id, enabled: !(a?.enabled) }); },
    removeAlert: (id: string) => { void removeAl({ alertId: id }); },
    acknowledgeEvent: (id: string) => { void ackEv({ eventId: id }); },
    runEvaluation: () => { if (orgId) void evaluate({ orgId, signals: SAMPLE_SIGNALS }); return 0; },
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
