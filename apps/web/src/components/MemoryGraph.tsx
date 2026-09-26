import { useMemo } from 'react';
import {
  GitBranch,
  CheckCircle2,
  History,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import type { MaintenanceHistory } from '@fieldmate/shared';

interface MemoryGraphProps {
  assetTag: string;
  records: MaintenanceHistory['maintenanceRecords'];
  incidents: MaintenanceHistory['incidents'];
  latestMeasurement?: {
    measurementType: string;
    value: number;
    unit: string;
    recordedAt: string;
  } | null;
  onSelectIncident?: (incidentId: string) => void;
}

const formatDateShort = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));

export function MemoryGraph({
  assetTag,
  records,
  incidents,
  latestMeasurement,
  onSelectIncident,
}: MemoryGraphProps) {
  // Group records by fault code
  const faultGroups = useMemo(() => {
    const map = new Map<
      string,
      Array<MaintenanceHistory['maintenanceRecords'][0]>
    >();
    for (const record of records) {
      const code = record.faultCode ?? 'General';
      const existing = map.get(code) ?? [];
      existing.push(record);
      map.set(code, existing);
    }
    return Array.from(map.entries());
  }, [records]);

  return (
    <div className="memory-graph-container" aria-label="Equipment Memory Graph">
      <div className="memory-graph-header">
        <div className="memory-graph-title">
          <GitBranch size={16} className="graph-icon" />
          <h4>Institutional Memory Graph</h4>
        </div>
        <span className="graph-badge">Asset Knowledge Tree</span>
      </div>

      <div className="memory-graph-tree">
        {/* Root Node */}
        <div className="tree-node root-node">
          <div className="node-content">
            <Cpu size={15} />
            <strong>{assetTag}</strong>
            <span className="node-desc">Equipment Root</span>
          </div>
        </div>

        {/* Fault Code Branches */}
        <div className="tree-branch-container">
          {faultGroups.length === 0 ? (
            <div className="tree-empty">
              <History size={14} />
              <span>No recorded fault history yet for {assetTag}</span>
            </div>
          ) : (
            faultGroups.map(([code, groupRecords]) => {
              const count = groupRecords.length;
              return (
                <div key={code} className="tree-fault-branch">
                  <div className="tree-connector-h" />
                  <div className="tree-node fault-node">
                    <div className="node-content">
                      <AlertCircle size={14} className="fault-icon" />
                      <strong>{code}</strong>
                      <span className="recurrence-pill">
                        {count} occurrence{count > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Incident / Repair Leaf Nodes */}
                  <div className="tree-leaf-container">
                    {groupRecords.map((record) => {
                      const matchedIncident = incidents.find(
                        (inc) =>
                          inc.faultCode === record.faultCode &&
                          Math.abs(
                            new Date(inc.openedAt).getTime() -
                              new Date(record.performedAt).getTime(),
                          ) <
                            1000 * 60 * 60 * 24 * 7,
                      );
                      return (
                        <div key={record.id} className="tree-leaf-item">
                          <div className="tree-connector-leaf" />
                          <button
                            type="button"
                            className="tree-node leaf-node"
                            onClick={() => {
                              if (matchedIncident && onSelectIncident) {
                                onSelectIncident(matchedIncident.id);
                              }
                            }}
                            title={
                              matchedIncident
                                ? 'View linked incident record'
                                : undefined
                            }
                          >
                            <span className="leaf-date">
                              {formatDateShort(record.performedAt)}
                            </span>
                            <span className="leaf-arrow">→</span>
                            <span className="leaf-cause">
                              {record.rootCause}
                            </span>
                            {record.verification && (
                              <span
                                className="leaf-verif"
                                title={record.verification}
                              >
                                ({record.verification})
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* Verification Branch */}
          {latestMeasurement && (
            <div className="tree-fault-branch verification-branch">
              <div className="tree-connector-h" />
              <div className="tree-node verif-node">
                <div className="node-content">
                  <CheckCircle2 size={14} className="verif-icon" />
                  <span>Latest Telemetry</span>
                  <strong>
                    {latestMeasurement.value} {latestMeasurement.unit}
                  </strong>
                  <small>
                    ({latestMeasurement.measurementType.replace('_', ' ')})
                  </small>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
