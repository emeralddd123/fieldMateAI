import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  Activity,
  AudioLines,
  ChevronRight,
  CircleHelp,
  Factory,
  LayoutDashboard,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  TableProperties,
} from 'lucide-react';
import { fetchAssets, fetchIncidents } from './api';
import { AssetOverview } from './components/AssetOverview';
import { MaintenancePanel } from './components/MaintenancePanel';
import { VoiceControls } from './components/VoiceControls';
import { ConversationTimeline } from './components/ConversationTimeline';
import { DashboardMetrics } from './components/DashboardMetrics';
import { IncidentDetailModal } from './components/IncidentDetailModal';
import { IncidentsDrawer } from './components/IncidentsDrawer';
import { QrScannerModal } from './components/QrScannerModal';
import { SupervisorView } from './components/SupervisorView';
import { useVoiceSession } from './voice/useVoiceSession';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './auth/LoginPage';
import { AccountPage } from './auth/AccountPage';
import { InvitationPage } from './auth/InvitationPage';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
} from './auth/PasswordResetPages';
import { ForbiddenPage } from './auth/AccessPages';
import { useAuth } from './auth/AuthProvider';
import { UserMenu } from './auth/UserMenu';
import { AdminLayout } from './admin/AdminLayout';
import { AdminOverviewPage } from './admin/AdminOverviewPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { AdminSitesPage } from './admin/AdminSitesPage';
import { AdminAssetsPage } from './admin/AdminAssetsPage';
import { AdminFaultsPage } from './admin/AdminFaultsPage';
import { AdminProceduresPage } from './admin/AdminProceduresPage';
import { AdminAuditPage } from './admin/AdminAuditPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/accept-invite/:token" element={<InvitationPage />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<TechnicianWorkspace />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="forbidden" element={<ForbiddenPage />} />
        <Route element={<ProtectedRoute roles={['supervisor', 'admin']} />}>
          <Route path="supervisor" element={<SupervisorView />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="sites" element={<AdminSitesPage />} />
            <Route path="assets" element={<AdminAssetsPage />} />
            <Route path="faults" element={<AdminFaultsPage />} />
            <Route path="procedures" element={<AdminProceduresPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function TechnicianWorkspace() {
  const auth = useAuth();
  const membership = auth.session!.memberships[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewIncidentId, setViewIncidentId] = useState<string | null>(null);
  const [isIncidentsDrawerOpen, setIsIncidentsDrawerOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  const voice = useVoiceSession(setSelectedId);
  const [search, setSearch] = useState('');
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: fetchAssets,
    refetchInterval: 5000,
  });
  const incidents = useQuery({
    queryKey: ['incidents'],
    queryFn: fetchIncidents,
    refetchInterval: 5000,
  });
  const selected =
    assets.data?.find((asset) => asset.id === selectedId) ??
    assets.data?.find((asset) => asset.assetTag === 'M-204') ??
    assets.data?.[0];

  const filtered = assets.data?.filter((asset) =>
    `${asset.assetTag} ${asset.name} ${asset.location}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const operationalCount = assets.data?.filter(
    (asset) => asset.status === 'operational',
  ).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="FieldMate AI home">
          <span className="brand-mark">
            <AudioLines size={24} />
          </span>
          <span>
            FieldMate<span className="brand-ai">AI</span>
            <small>MAINTENANCE INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">
          <LayoutDashboard size={15} /> Technician workspace
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-action-btn"
            onClick={() => setIsIncidentsDrawerOpen(true)}
            title="Open cross-plant incident register"
          >
            <TableProperties size={14} />
            <span>Incidents ({incidents.data?.length ?? 0})</span>
          </button>
          {auth.hasRole('supervisor', 'admin') && (
            <a
              className="topbar-action-btn supervisor-role-link"
              href="/supervisor"
            >
              <ShieldCheck size={14} />
              <span>Supervisor view</span>
            </a>
          )}
          <button
            type="button"
            className="topbar-action-btn topbar-qr-btn"
            onClick={() => setIsQrScannerOpen(true)}
            title="Scan equipment QR barcode tag"
          >
            <QrCode size={14} />
            <span>Scan QR</span>
          </button>
          <span className="plant">
            <Factory size={15} />
            {membership?.sites[0]?.name ?? membership?.organization.name}
          </span>
          <UserMenu />
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="Equipment selection">
          <div className="sidebar-heading">
            <span>EQUIPMENT</span>
            <span className="count">{assets.data?.length ?? '—'}</span>
          </div>
          <div className="sidebar-search-row">
            <label className="search-box">
              <Search size={15} />
              <input
                aria-label="Search equipment"
                placeholder="Find an asset…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="scan-qr-sidebar-btn"
              onClick={() => setIsQrScannerOpen(true)}
              title="Scan machine tag barcode/QR"
            >
              <QrCode size={16} />
            </button>
          </div>
          <div className="asset-list">
            {assets.isPending && (
              <p className="sidebar-message" role="status">
                Loading equipment…
              </p>
            )}
            {assets.isError && (
              <p className="sidebar-message">Equipment unavailable</p>
            )}
            {filtered?.map((asset) => (
              <button
                key={asset.id}
                className={`asset-button ${selected?.id === asset.id ? 'selected' : ''}`}
                aria-pressed={selected?.id === asset.id}
                onClick={() => setSelectedId(asset.id)}
              >
                <span className={`status-dot ${asset.status}`} />
                <span>
                  <strong>{asset.assetTag}</strong>
                  <small>{asset.name}</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
            {filtered?.length === 0 && (
              <p className="sidebar-message">No matching equipment.</p>
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="plant-health">
              <span className="health-icon">
                <Activity size={18} />
              </span>
              <div>
                <strong>Plant overview</strong>
                <small>
                  {assets.data
                    ? `${operationalCount} of ${assets.data.length} assets operational`
                    : 'Waiting for equipment data'}
                </small>
              </div>
            </div>
            <div className="sidebar-footer">
              <ShieldCheck size={14} /> Approved knowledge. Safer decisions.
            </div>
          </div>
        </aside>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="breadcrumb">
                WORKSPACE <ChevronRight size={11} /> EQUIPMENT
              </div>
              <h1>Know your equipment.</h1>
              <p>
                Every asset. Every repair. Your team’s knowledge, connected.
              </p>
            </div>
            <div className="page-heading-actions">
              <button
                type="button"
                className="secondary-action-btn"
                onClick={() => setIsIncidentsDrawerOpen(true)}
                title="View plant incident register"
              >
                <TableProperties size={15} />
                <span>All Incidents</span>
              </button>
              <button
                className="icon-button"
                aria-label="Refresh equipment"
                disabled={assets.isFetching}
                onClick={() => void assets.refetch()}
              >
                <RefreshCw
                  size={17}
                  className={assets.isFetching ? 'spin' : ''}
                />
              </button>
            </div>
          </div>
          <VoiceControls voice={voice} />
          <DashboardMetrics
            assets={assets.data ?? []}
            incidents={incidents.data ?? []}
            onSelectAsset={setSelectedId}
            onSelectIncident={setViewIncidentId}
            onOpenIncidents={() => setIsIncidentsDrawerOpen(true)}
          />
          <div className="main-columns">
            <div>
              {assets.isError ? (
                <div className="state-card" role="alert">
                  <CircleHelp size={28} />
                  <h2>Unable to load equipment</h2>
                  <p>{assets.error.message}</p>
                  <button
                    className="secondary-button"
                    onClick={() => void assets.refetch()}
                  >
                    Try again
                  </button>
                </div>
              ) : assets.isPending ? (
                <div className="state-card" role="status">
                  <RefreshCw className="spin" size={26} />
                  <h2>Loading equipment</h2>
                  <p>Retrieving the Plant Alpha equipment register.</p>
                </div>
              ) : selected ? (
                <AssetOverview asset={selected} />
              ) : (
                <div className="state-card">
                  <Factory size={28} />
                  <h2>No equipment yet</h2>
                  <p>
                    The equipment register is empty. Add demo assets with the
                    documented seed command.
                  </p>
                </div>
              )}
              {selected && (
                <MaintenancePanel
                  assetId={selected.id}
                  onSelectIncident={setViewIncidentId}
                />
              )}
            </div>
            <ConversationTimeline voice={voice} />
          </div>

          <footer className="safety-note">
            <ShieldCheck size={14} />
            <p>
              FieldMate provides maintenance decision support using approved
              equipment data. Always follow site safety procedures and
              qualified-person requirements.
            </p>
          </footer>
        </main>
      </div>

      {/* Incident Detail Modal */}
      <IncidentDetailModal
        incidentId={viewIncidentId}
        onClose={() => setViewIncidentId(null)}
        onSelectAsset={setSelectedId}
      />

      {/* Cross-Plant Incidents Register Drawer */}
      <IncidentsDrawer
        isOpen={isIncidentsDrawerOpen}
        onClose={() => setIsIncidentsDrawerOpen(false)}
        incidents={incidents.data ?? []}
        onSelectIncident={(id) => {
          setIsIncidentsDrawerOpen(false);
          setViewIncidentId(id);
        }}
      />

      {/* QR Barcode Scanner Modal */}
      <QrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        assets={assets.data ?? []}
        onSelectAsset={setSelectedId}
      />
    </div>
  );
}
