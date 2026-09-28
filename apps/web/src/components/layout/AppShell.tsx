import { NavLink, Outlet } from 'react-router';
import { BrainCircuit, Gauge, LayoutDashboard, LogOut, Zap } from 'lucide-react';
import { ACTIVE_ANOMALY_STATUSES } from '@aiem/shared/constants';
import { BRAND } from '@/brand';
import { AnalysisPanelProvider, RunAnalysisButton } from '@/components/analysis/AnalysisPanel';
import { useAnalysisPanel } from '@/components/analysis/context';
import { Button } from '@/components/ui/button';
import { useAnomalies, useHealth, useLatestAnalysis, useLogout, useMe } from '@/hooks/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

function NavItem({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: typeof Gauge;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        )
      }
    >
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-critical px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular-nums">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const { data: anomalies } = useAnomalies();
  const { data: health } = useHealth();
  const { data: user } = useMe();
  const logout = useLogout();
  const active = anomalies?.filter((a) => ACTIVE_ANOMALY_STATUSES.includes(a.status)).length;

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Zap className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-white">{BRAND.name}</div>
          <div className="text-xs text-sidebar-foreground/60">{BRAND.tagline}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
        <NavItem to="/meters" icon={Gauge} label="Medidores" />
        <NavItem to="/anomalies" icon={BrainCircuit} label="Anomalías IA" badge={active} />
      </nav>

      <div className="mt-auto space-y-3 border-t border-sidebar-border px-5 py-4 text-xs">
        <div className="flex items-center gap-2" title="Quién redacta las explicaciones">
          <span
            className={cn(
              'size-2 rounded-full',
              health?.llm.available ? 'bg-ok' : 'bg-sidebar-foreground/40',
            )}
          />
          <span className="text-sidebar-foreground/70">
            {health?.llm.available
              ? `IA local · ${health.llm.model}`
              : 'Explicaciones con plantillas'}
          </span>
        </div>
        {user && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-white">{user.name}</div>
              <div className="truncate text-sidebar-foreground/60">{user.email}</div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
              title="Cerrar sesión"
              onClick={() => logout.mutate()}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

function TopBar() {
  const { data: run } = useLatestAnalysis();
  const { open } = useAnalysisPanel();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Zap className="size-5 text-primary" />
        <span className="font-semibold">{BRAND.name}</span>
      </div>
      <button
        type="button"
        onClick={open}
        className="hidden text-left text-sm text-muted-foreground hover:text-foreground md:block"
      >
        {run?.status === 'COMPLETED' && run.finishedAt ? (
          <>
            Último análisis {timeAgo(run.finishedAt)} ·{' '}
            <span className="text-foreground">{run.summary?.message}</span>
          </>
        ) : run?.status === 'FAILED' ? (
          <span className="text-critical">El último análisis falló</span>
        ) : run ? (
          'Análisis en curso…'
        ) : (
          'Aún no se ha ejecutado un análisis'
        )}
      </button>
      <RunAnalysisButton />
    </header>
  );
}

export function AppShell() {
  return (
    <AnalysisPanelProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl space-y-6 p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AnalysisPanelProvider>
  );
}
