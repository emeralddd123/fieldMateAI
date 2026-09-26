import { z } from 'zod';
import { writeRequestSchema } from '@fieldmate/shared';
import type { WriteRequest, WriteResult } from '@fieldmate/shared';
import type { ToolOutcome } from './tools';
export interface WritePrompt {
  title: string;
  details: string[];
}
export interface WriteNotice extends WritePrompt {
  requestId: string;
  status: 'saving' | 'unknown' | 'saved' | 'failed';
  message: string;
}
const pendingSchema = z.object({
  requestId: z.uuid(),
  request: writeRequestSchema,
  title: z.string(),
  details: z.array(z.string()),
});
type Pending = z.infer<typeof pendingSchema>;
const storageKey = 'fieldmate.pending-writes.v1';
export class WriteRejected extends Error {}
interface Dependencies {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  preview(request: WriteRequest, signal: AbortSignal): Promise<WritePrompt>;
  confirm(prompt: WritePrompt, signal: AbortSignal): Promise<boolean>;
  submit(request: WriteRequest, requestId: string): Promise<WriteResult>;
  changed(notice: WriteNotice): void;
  saved(assetId: string): void;
  uuid(): string;
}
export class VoiceWrites {
  private active = new Map<string, Promise<ToolOutcome>>();
  constructor(private deps: Dependencies) {}
  private load(): Pending[] {
    const raw = this.deps.storage.getItem(storageKey);
    return raw ? z.array(pendingSchema).max(20).parse(JSON.parse(raw)) : [];
  }
  private persist(items: Pending[]) {
    this.deps.storage.setItem(storageKey, JSON.stringify(items));
  }
  restore() {
    try {
      for (const item of this.load())
        this.notice(
          item,
          'unknown',
          'A previous save needs checking. Retry uses the same request ID.',
        );
    } catch {
      this.deps.changed({
        requestId: 'storage',
        title: 'Save recovery unavailable',
        details: [],
        status: 'failed',
        message:
          'Browser save history could not be read. Check records before creating another entry.',
      });
    }
  }
  private notice(
    item: Pending,
    status: WriteNotice['status'],
    message: string,
  ) {
    this.deps.changed({
      requestId: item.requestId,
      title: item.title,
      details: item.details,
      status,
      message,
    });
  }
  private result(message: string, error = true): ToolOutcome {
    return {
      isError: error,
      result: { success: false, message },
      summary: message,
    };
  }
  async execute(
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<ToolOutcome> {
    const parsed = writeRequestSchema.safeParse({ name, args });
    if (!parsed.success)
      return this.result(
        'Invalid write arguments. Ask for missing or unclear asset, reading, unit, priority or status. No record was saved.',
      );
    const request = parsed.data;
    if (
      request.name === 'record_measurement' &&
      request.args.unit !==
        (request.args.measurement_type === 'line_voltage' ? 'V' : 'A')
    )
      return this.result(
        'Voltage requires V and current requires A. No record was saved.',
      );
    if (
      request.name === 'create_incident' &&
      new Set(request.args.measurement_ids).size !==
        (request.args.measurement_ids?.length ?? 0)
    )
      return this.result(
        'Duplicate measurement IDs are not allowed. No incident was saved.',
      );
    try {
      // Recovery keys survive page reloads. Never invent a new key for an uncertain identical save.
      const previous = this.load().find(
        (item) => JSON.stringify(item.request) === JSON.stringify(request),
      );
      const preview = previous ?? (await this.deps.preview(request, signal));
      if (
        signal.aborted ||
        !(await this.deps.confirm(preview, signal)) ||
        signal.aborted
      )
        return this.result(
          'Save cancelled before submission. No new record was saved.',
          false,
        );
      const item: Pending = previous ?? {
        ...preview,
        request,
        requestId: this.deps.uuid(),
      };
      if (!previous) {
        const items = this.load();
        if (items.length >= 20)
          return this.result(
            'Resolve pending saves before adding more records. Nothing was submitted.',
          );
        this.persist([...items, item]);
      }
      // After confirmation and dispatch, cancellation cannot undo a committed write.
      // Keep tracking its outcome even when the voice session is interrupted or ended.
      return await this.dispatch(item);
    } catch (error) {
      if (error instanceof WriteRejected) return this.result(error.message);
      return this.result(
        'Unable to prepare this save. Check the asset and browser storage. Nothing new was submitted.',
      );
    }
  }
  async retry(requestId: string) {
    try {
      const item = this.load().find((item) => item.requestId === requestId);
      if (item) await this.dispatch(item);
    } catch {
      /* Existing notice remains actionable; never generate a replacement key. */
    }
  }
  private dispatch(item: Pending): Promise<ToolOutcome> {
    const running = this.active.get(item.requestId);
    if (running) return running;
    const task = this.perform(item).finally(() =>
      this.active.delete(item.requestId),
    );
    this.active.set(item.requestId, task);
    return task;
  }
  private async perform(item: Pending): Promise<ToolOutcome> {
    this.notice(item, 'saving', 'Saving the confirmed request…');
    try {
      const data = await this.deps.submit(item.request, item.requestId);
      if (
        data.requestId !== item.requestId ||
        data.assetId !== item.request.args.asset_id
      )
        throw new Error('Invalid save response');
      const message =
        item.request.name === 'create_incident'
          ? `Saved incident ${data.incidentNumber}.`
          : `Saved reading ${data.value} ${data.unit}.`;
      // Storage cleanup can fail after a successful write; keeping the old key is safe to retry.
      try {
        this.persist(
          this.load().filter((entry) => entry.requestId !== item.requestId),
        );
      } catch {
        /* Same key is retained. */
      }
      this.notice(item, 'saved', message);
      try {
        this.deps.saved(data.assetId);
      } catch {
        /* Save is durable even if refreshing the view fails. */
      }
      return {
        isError: false,
        result: { success: true, ...data },
        summary: message,
        assetId: data.assetId,
      };
    } catch (error) {
      if (error instanceof WriteRejected) {
        try {
          this.persist(
            this.load().filter((entry) => entry.requestId !== item.requestId),
          );
        } catch {
          /* Retain safe recovery key. */
        }
        this.notice(item, 'failed', error.message);
        return this.result(error.message);
      }
      const message =
        'Save outcome unconfirmed. The record may already exist. Use “Check save” on the existing request; do not create another record.';
      this.notice(item, 'unknown', message);
      return this.result(message);
    }
  }
}
