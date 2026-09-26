import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AudioLines,
  ChevronRight,
  CircleHelp,
  Factory,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { fetchAssets } from './api';
import { AssetOverview } from './components/AssetOverview';
import { MaintenancePanel } from './components/MaintenancePanel';
import { VoiceControls } from './components/VoiceControls';
import { ConversationTimeline } from './components/ConversationTimeline';
import { useVoiceSession } from './voice/useVoiceSession';

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const voice = useVoiceSession(setSelectedId);
  const [search, setSearch] = useState('');
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: fetchAssets,
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
          <span className="plant">
            <Factory size={15} />
            Plant Alpha
          </span>
          <span className="demo-badge">DEMO</span>
          <span className="avatar" title="Demo Technician">
            DT
          </span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="Equipment selection">
          <div className="sidebar-heading">
            <span>EQUIPMENT</span>
            <span className="count">{assets.data?.length ?? '—'}</span>
          </div>
          <label className="search-box">
            <Search size={15} />
            <input
              aria-label="Search equipment"
              placeholder="Find an asset…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
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
          <VoiceControls voice={voice} />
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
              {selected && <MaintenancePanel assetId={selected.id} />}
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
    </div>
  );
}
