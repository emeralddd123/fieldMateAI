import { findAssetArgumentsSchema } from '@fieldmate/shared';
import type { Asset } from '@fieldmate/shared';

export interface ToolOutcome {
  result: object;
  isError: boolean;
  summary: string;
  assetId?: string;
}
export type ExecuteTool = (
  name: string,
  args: unknown,
  signal: AbortSignal,
) => Promise<ToolOutcome>;
export function createToolExecutor(
  search: (query: string, signal: AbortSignal) => Promise<Asset[]>,
): ExecuteTool {
  return async (name, args, signal) => {
    if (name !== 'find_asset')
      return {
        isError: true,
        result: {
          error:
            'This tool is unavailable. Only find_asset is connected. No records were changed.',
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
