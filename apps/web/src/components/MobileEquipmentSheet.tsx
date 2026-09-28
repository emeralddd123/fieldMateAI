import { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  MapPin,
  QrCode,
  Search,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import type { Asset } from '@fieldmate/shared';
import type { DashboardIncident } from '../api';

const FAVORITES_KEY = 'fieldmate_favorite_assets';
const RECENT_KEY = 'fieldmate_recent_assets';

interface MobileEquipmentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  selectedAssetId?: string | null;
  onSelectAsset: (assetId: string) => void;
  onOpenQrScanner?: () => void;
  incidents?: DashboardIncident[];
}

export function MobileEquipmentSheet({
  isOpen,
  onClose,
  assets,
  selectedAssetId,
  onSelectAsset,
  onOpenQrScanner,
  incidents = [],
}: MobileEquipmentSheetProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'recent' | 'favorites'>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  });

  // Track recent selection
  useEffect(() => {
    if (selectedAssetId) {
      setRecent((prev) => {
        const next = [
          selectedAssetId,
          ...prev.filter((id) => id !== selectedAssetId),
        ].slice(0, 5);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {
          // ignore localStorage error
        }
        return next;
      });
    }
  }, [selectedAssetId]);

  const toggleFavorite = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Map assetId to open incident counts
  const incidentCountByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const inc of incidents) {
      if (!['resolved', 'closed'].includes(inc.status) && inc.assetId) {
        map.set(inc.assetId, (map.get(inc.assetId) || 0) + 1);
      }
    }
    return map;
  }, [incidents]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = assets;

    if (tab === 'favorites') {
      list = assets.filter((a) => favorites.includes(a.id));
    } else if (tab === 'recent') {
      list = assets.filter((a) => recent.includes(a.id));
    }

    if (!q) return list;
    return list.filter((a) =>
      `${a.assetTag} ${a.name} ${a.location} ${a.equipmentType} ${a.manufacturer}`
        .toLowerCase()
        .includes(q),
    );
  }, [assets, search, tab, favorites, recent]);

  const currentAsset = assets.find((a) => a.id === selectedAssetId);

  if (!isOpen) return null;

  return (
    <div
      className="mobile-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Select equipment"
    >
      <div
        className="mobile-equipment-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-sheet-handle" />

        <div className="mobile-sheet-header">
          <div className="equipment-sheet-title">
            <Wrench size={18} className="sheet-icon" />
            <div>
              <h2>Equipment Directory</h2>
              <small>{assets.length} machines registered</small>
            </div>
          </div>
          <button
            type="button"
            className="sheet-close-btn"
            onClick={onClose}
            aria-label="Close equipment directory"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & QR scanner bar */}
        <div className="sheet-search-row">
          <div className="sheet-search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search tag, machine, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search equipment"
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {onOpenQrScanner && (
            <button
              type="button"
              className="sheet-qr-btn"
              onClick={() => {
                onClose();
                onOpenQrScanner();
              }}
              title="Scan machine barcode tag"
              aria-label="Scan machine barcode tag"
            >
              <QrCode size={18} />
              <span>Scan QR</span>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="sheet-filter-pills">
          <button
            type="button"
            className={`sheet-pill ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            All Machines ({assets.length})
          </button>
          <button
            type="button"
            className={`sheet-pill ${tab === 'favorites' ? 'active' : ''}`}
            onClick={() => setTab('favorites')}
          >
            Favorites ({favorites.length})
          </button>
          <button
            type="button"
            className={`sheet-pill ${tab === 'recent' ? 'active' : ''}`}
            onClick={() => setTab('recent')}
          >
            Recent ({recent.length})
          </button>
        </div>

        {/* Equipment List */}
        <div className="sheet-equipment-list">
          {/* Active selection card if in 'all' tab and no search */}
          {!search && tab === 'all' && currentAsset && (
            <div className="active-machine-section">
              <span className="section-label">CURRENTLY ACTIVE</span>
              <div
                className="equipment-card active-card"
                onClick={() => onClose()}
              >
                <div className="card-status-indicator">
                  <span className={`status-dot ${currentAsset.status}`} />
                </div>
                <div className="card-main-info">
                  <div className="card-tag-row">
                    <strong className="card-tag">{currentAsset.assetTag}</strong>
                    <span className={`status-pill ${currentAsset.status}`}>
                      {currentAsset.status}
                    </span>
                    {incidentCountByAsset.get(currentAsset.id) ? (
                      <span className="incident-pill">
                        <AlertTriangle size={11} />
                        {incidentCountByAsset.get(currentAsset.id)} open
                      </span>
                    ) : null}
                  </div>
                  <div className="card-name">{currentAsset.name}</div>
                  <div className="card-location">
                    <MapPin size={12} />
                    <span>{currentAsset.location}</span>
                  </div>
                </div>
                <div className="card-selected-badge">
                  <Check size={16} />
                </div>
              </div>
            </div>
          )}

          <div className="all-machines-section">
            {!search && tab === 'all' && currentAsset && (
              <span className="section-label">ALL ASSETS</span>
            )}

            {filteredAssets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              const isFav = favorites.includes(asset.id);
              const openIncidents = incidentCountByAsset.get(asset.id) || 0;

              return (
                <div
                  key={asset.id}
                  className={`equipment-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectAsset(asset.id);
                    onClose();
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="card-status-indicator">
                    <span className={`status-dot ${asset.status}`} />
                  </div>
                  <div className="card-main-info">
                    <div className="card-tag-row">
                      <strong className="card-tag">{asset.assetTag}</strong>
                      <span className={`status-badge-compact ${asset.status}`}>
                        {asset.status}
                      </span>
                      {openIncidents > 0 && (
                        <span className="incident-pill">
                          <AlertTriangle size={11} />
                          {openIncidents} issue{openIncidents > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="card-name">{asset.name}</div>
                    <div className="card-location">
                      <MapPin size={12} />
                      <span>{asset.location}</span>
                    </div>
                  </div>
                  <div className="card-actions-right">
                    <button
                      type="button"
                      className={`favorite-btn ${isFav ? 'favorited' : ''}`}
                      onClick={(e) => toggleFavorite(e, asset.id)}
                      title={isFav ? 'Remove favorite' : 'Add to favorites'}
                      aria-label={isFav ? 'Remove favorite' : 'Add to favorites'}
                    >
                      <Star
                        size={17}
                        fill={isFav ? '#fbbf24' : 'none'}
                        color={isFav ? '#fbbf24' : '#64748b'}
                      />
                    </button>
                    <ChevronRight size={16} className="chevron-icon" />
                  </div>
                </div>
              );
            })}

            {filteredAssets.length === 0 && (
              <div className="sheet-empty-state">
                <Wrench size={32} />
                <p>No equipment matching &ldquo;{search}&rdquo;</p>
                <small>Try searching by tag, machine name, or bay location</small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
