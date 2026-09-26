import {
  findAssetArgumentsSchema,
  lookupFaultArgumentsSchema,
  historyArgumentsSchema,
} from '@fieldmate/shared';
import type {
  Asset,
  FaultDefinition,
  MaintenanceHistory,
  HistoryArguments,
} from '@fieldmate/shared';

export interface ToolOutcome {
  result: object;
  isError: boolean;
  summary: string;
  assetId?: string;
  source?: string;
  details?: string[];
}
export type ExecuteTool = (
  name: string,
  args: unknown,
  signal: AbortSignal,
) => Promise<ToolOutcome>;
export class LookupError extends Error {
  constructor(
    public code: 'ASSET_NOT_FOUND' | 'AMBIGUOUS_FAULT' | 'UNAVAILABLE',
  ) {
    super(code);
  }
}
interface KnowledgeLookups {
  fault(
    assetId: string,
    faultCode: string,
    signal: AbortSignal,
  ): Promise<FaultDefinition>;
  history(
    args: HistoryArguments,
    signal: AbortSignal,
  ): Promise<MaintenanceHistory>;
}
export function createToolExecutor(
  search: (query: string, signal: AbortSignal) => Promise<Asset[]>,
  knowledge?: KnowledgeLookups,
  procedure?: (args: unknown, signal: AbortSignal) => Promise<ToolOutcome>,
): ExecuteTool {
  return async (name, args, signal) => {
    if (name === 'get_approved_procedure' && procedure)
      return procedure(args, signal);
    if (name === 'lookup_fault_code' || name === 'get_maintenance_history') {
      const parsed =
        name === 'lookup_fault_code'
          ? lookupFaultArgumentsSchema.safeParse(args)
          : historyArgumentsSchema.safeParse(args);
      if (!parsed.success)
        return {
          isError: true,
          result: {
            error:
              'Use the asset UUID returned by find_asset and an exact nonempty fault_code (required for fault lookup). History limit must be an integer from 1 to 10. No extra fields are allowed.',
          },
          summary:
            'Lookup needs a valid asset and fault code or history limit.',
        };
      try {
        if (!knowledge) throw new LookupError('UNAVAILABLE');
        if (name === 'lookup_fault_code') {
          const data = await knowledge.fault(
            parsed.data.asset_id,
            parsed.data.fault_code!,
            signal,
          );
          if (data.assetId !== parsed.data.asset_id)
            throw new LookupError('UNAVAILABLE');
          return {
            isError: false,
            result: data,
            summary: data.found
              ? `${data.faultCode} · ${data.title}`
              : `${data.faultCode}: no verified definition for this equipment.`,
            source: data.found ? data.source : undefined,
            details: data.found
              ? [
                  data.description,
                  `${data.manufacturer} · ${data.model}`,
                  `Safety: ${data.safetyLevel}. Request the approved procedure before any steps; required safety confirmation happens in the workspace.`,
                ]
              : [data.message],
          };
        }
        const data = await knowledge.history(
          {
            ...parsed.data,
            limit: 'limit' in parsed.data ? (parsed.data.limit ?? 5) : 5,
          },
          signal,
        );
        if (data.assetId !== parsed.data.asset_id)
          throw new LookupError('UNAVAILABLE');
        const source = `${data.assetTag} maintenance records · Simulated demo data`;
        return {
          isError: false,
          result: {
            ...data,
            source,
            faultCodeFilter: parsed.data.fault_code ?? null,
            guidance:
              'Historical observations only; do not treat a past repair as the current root cause or an approved procedure.',
          },
          summary: `${data.assetTag}: ${data.totalMatchingIncidents} matching incidents; ${data.maintenanceRecords.length} repair records retrieved.`,
          source,
          details: [
            ...data.incidents
              .slice(0, 3)
              .map((item) => `${item.incidentNumber}: ${item.title}`),
            ...data.incidents
              .flatMap((item) =>
                item.notes.map(
                  (note) => `${item.incidentNumber} note: ${note.note}`,
                ),
              )
              .slice(0, 3),
            ...data.maintenanceRecords
              .slice(0, 2)
              .map(
                (record) =>
                  `Past repair: ${record.rootCause}. ${record.actionTaken}`,
              ),
          ],
        };
      } catch (error) {
        const message =
          error instanceof LookupError && error.code === 'ASSET_NOT_FOUND'
            ? 'This asset no longer exists. Use find_asset again.'
            : error instanceof LookupError && error.code === 'AMBIGUOUS_FAULT'
              ? 'Multiple installed models match this fault. Ask which component reported it; model-specific clarification is required before guidance.'
              : 'The requested knowledge is temporarily unavailable. Please retry; do not guess the fault definition or history.';
        return { isError: true, result: { error: message }, summary: message };
      }
    }
    if (name !== 'find_asset')
      return {
        isError: true,
        result: {
          error:
            'This tool is unavailable. Only equipment and approved knowledge tools are connected. No records were changed.',
        },
        summary: 'Requested action unavailable.',
      };
    const parsed = findAssetArgumentsSchema.safeParse(args);
    if (!parsed.success)
      return {
        isError: true,
        result: {
          error:
            'query must be a nonempty string of at most 100 characters, with no extra fields. Ask for the asset tag and retry.',
        },
        summary: 'Equipment search needs a valid asset tag or keyword.',
      };
    try {
      const matches = await search(parsed.data.query, signal);
      return {
        isError: false,
        result: {
          matches: matches.slice(0, 20),
          totalMatches: matches.length,
          source: 'Plant Alpha equipment register · Simulated demo data',
          selection: matches.length === 1 ? 'unique_match' : 'none',
        },
        summary:
          matches.length === 1
            ? `Found ${matches[0]!.assetTag} · ${matches[0]!.name}`
            : matches.length === 0
              ? 'No equipment matched. Check the asset tag.'
              : `Found ${matches.length} matches. Specify the asset tag: ${matches
                  .slice(0, 20)
                  .map((asset) => asset.assetTag)
                  .join(', ')}.`,
        assetId: matches.length === 1 ? matches[0]!.id : undefined,
      };
    } catch {
      return {
        isError: true,
        result: {
          error:
            'Equipment search is temporarily unavailable. Ask the technician to retry; do not guess equipment details.',
        },
        summary: 'Equipment search unavailable. Please retry.',
      };
    }
  };
}

export interface ToolActivity {
  id: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  summary: string;
  source?: string;
  details?: string[];
}
// Results may finish before or after reply.done. Only flush at an idle reply boundary.
export class VoiceToolQueue {
  private pending = new Map<
    string,
    { abort: AbortController; outcome?: ToolOutcome }
  >();
  private seen = new Set<string>();
  private idle = false;
  constructor(
    private execute: ExecuteTool,
    private send: (event: object) => void,
    private changed: (activity: ToolActivity, assetId?: string) => void,
  ) {}
  call(id: string, name: string, args: unknown) {
    if (this.seen.has(id)) return;
    if (this.seen.size >= 100) throw new Error('Too many tool calls');
    this.seen.add(id);
    const entry = { abort: new AbortController() } as {
      abort: AbortController;
      outcome?: ToolOutcome;
    };
    this.pending.set(id, entry);
    this.changed({
      id,
      status: 'running',
      summary:
        name === 'find_asset'
          ? 'Searching equipment…'
          : name === 'lookup_fault_code'
            ? 'Looking up the reported fault…'
            : name === 'get_maintenance_history'
              ? 'Retrieving maintenance history…'
              : 'Checking requested action…',
    });
    void this.execute(name, args, entry.abort.signal)
      .catch(() => ({
        result: { error: 'The action failed. Please retry.' },
        isError: true,
        summary: 'Action unavailable. Please retry.',
      }))
      .then((outcome) => {
        if (entry.abort.signal.aborted || this.pending.get(id) !== entry)
          return;
        entry.outcome = outcome;
        this.flush();
      });
  }
  busy() {
    this.idle = false;
  }
  done(interrupted: boolean) {
    if (interrupted) this.cancel();
    else {
      this.idle = true;
      this.flush();
    }
  }
  private flush() {
    if (!this.idle) return;
    for (const [id, entry] of this.pending) {
      if (!entry.outcome) continue;
      const outcome = entry.outcome;
      this.pending.delete(id);
      try {
        this.send({
          type: 'tool.result',
          call_id: id,
          result: JSON.stringify(outcome.result),
          is_error: outcome.isError,
        });
      } catch {
        this.changed({
          id,
          status: 'error',
          summary: 'Could not return the lookup result. Please reconnect.',
        });
        continue;
      }
      this.changed(
        {
          id,
          status: outcome.isError ? 'error' : 'completed',
          summary: outcome.summary,
          source: outcome.source,
          details: outcome.details,
        },
        outcome.assetId,
      );
    }
  }
  cancel() {
    this.idle = false;
    for (const [id, entry] of this.pending) {
      entry.abort.abort();
      this.changed({ id, status: 'cancelled', summary: 'Lookup cancelled.' });
    }
    this.pending.clear();
  }
}
