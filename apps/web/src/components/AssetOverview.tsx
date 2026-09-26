import { Activity, ArrowUpRight, Box, Cpu, MapPin, Zap } from 'lucide-react';
import type { Asset } from '@fieldmate/shared';

export function AssetOverview({ asset }: { asset: Asset }) {
  return (
    <section className="asset-overview" aria-labelledby="asset-heading">
      <div className="section-eyebrow">
        <span>ASSET OVERVIEW</span>
        <span className="mono">{asset.assetTag}</span>
      </div>
      <div className="asset-title-row">
        <div>
          <div className="asset-location">
            <MapPin size={13} />
            {asset.location}
          </div>
          <h2 id="asset-heading">{asset.name}</h2>
          <p>
            {asset.equipmentType} <span className="separator">/</span>{' '}
            {asset.manufacturer}
          </p>
        </div>
        <span className={`status-pill ${asset.status}`}>
          <span className="status-dot" />
          {asset.status}
        </span>
      </div>
      <div className="equipment-stage" aria-hidden="true">
        <div className="stage-grid" />
        <div className="stage-caption">
          <span className="tiny-square" /> EQUIPMENT PROFILE
          <span>01 / {asset.assetTag}</span>
        </div>
        <div className="equipment-outline">
          <div className="motor-foot" />
          <div className="motor-body">
            <div className="motor-cap" />
            <div className="motor-fins">
              {Array.from({ length: 9 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
            <div className="motor-face">
              <div className="motor-shaft" />
            </div>
            <div className="motor-terminal">
              <Zap size={20} />
            </div>
          </div>
        </div>
        <div className="stage-label">
          <span className="status-dot" />
          {asset.status.toUpperCase()}
          <span>SIMULATED ASSET</span>
        </div>
      </div>
      <div className="spec-grid">
        <div>
          <Zap size={16} />
          <span>Nominal voltage</span>
          <strong>
            {asset.nominalVoltageV ?? '—'}
            <small>{asset.nominalVoltageV !== null ? 'V' : ''}</small>
          </strong>
        </div>
        <div>
          <Activity size={16} />
          <span>Nominal current</span>
          <strong>
            {asset.nominalCurrentA ?? '—'}
            <small>{asset.nominalCurrentA !== null ? 'A' : ''}</small>
          </strong>
        </div>
        <div>
          <Box size={16} />
          <span>Equipment model</span>
          <strong className="model-value">{asset.model}</strong>
        </div>
      </div>
      <div className="component-heading">
        <h3>Installed components</h3>
        <span>{String(asset.components.length).padStart(2, '0')}</span>
      </div>
      {asset.components.length ? (
        asset.components.map((component) => (
          <div className="component-card" key={component.id}>
            <span className="component-icon">
              <Cpu size={21} />
            </span>
            <div>
              <h4>{component.componentType}</h4>
              <p>{component.model}</p>
            </div>
            <ArrowUpRight size={17} aria-hidden="true" />
          </div>
        ))
      ) : (
        <p className="muted empty-components">
          No installed components recorded for this asset.
        </p>
      )}
      <div className="source-note">
        <span className="tiny-square" />
        Source: Plant Alpha equipment register · Simulated demo data
      </div>
    </section>
  );
}
