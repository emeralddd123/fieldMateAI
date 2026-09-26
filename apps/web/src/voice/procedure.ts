import { procedureArgumentsSchema } from '@fieldmate/shared';
import type { ProcedureResult, ProcedureRequest } from '@fieldmate/shared';
import type { ToolOutcome } from './tools';

export interface SafetyPrompt {
  assetTag: string;
  title: string;
  source: string;
  message: string;
}
export class SafetyConfirmation<T = SafetyPrompt> {
  private finish?: (accepted: boolean) => void;
  constructor(
    private changed: (prompt: T | null) => void,
    private timeoutMs = 60_000,
  ) {}
  request(prompt: T, signal: AbortSignal): Promise<boolean> {
    // Concurrent requests cannot share or replace an existing confirmation.
    if (this.finish || signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const complete = (accepted: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', aborted);
        this.finish = undefined;
        this.changed(null);
        resolve(accepted && !signal.aborted);
      };
      const aborted = () => complete(false);
      const timer = setTimeout(aborted, this.timeoutMs);
      this.finish = complete;
      signal.addEventListener('abort', aborted, { once: true });
      this.changed(prompt);
    });
  }
  answer(accepted: boolean) {
    this.finish?.(accepted);
  }
}
export function createProcedureExecutor(
  fetchProcedure: (
    args: ProcedureRequest,
    confirmed: boolean,
    signal: AbortSignal,
  ) => Promise<ProcedureResult>,
  confirm: (prompt: SafetyPrompt, signal: AbortSignal) => Promise<boolean>,
) {
  return async (args: unknown, signal: AbortSignal): Promise<ToolOutcome> => {
    const parsed = procedureArgumentsSchema.safeParse(args);
    if (!parsed.success)
      return {
        isError: true,
        result: {
          error:
            'Provide only asset_id (UUID) and procedure_key from verified fault lookup. Safety confirmation cannot be supplied by the agent.',
        },
        summary: 'A valid asset and approved procedure key are required.',
      };
    try {
      let data = await fetchProcedure(parsed.data, false, signal);
      if (!data.found)
        return { isError: false, result: data, summary: data.message };
      if (
        data.assetId !== parsed.data.asset_id ||
        data.procedure.key !== parsed.data.procedure_key
      )
        throw new Error('Mismatched procedure');
      if (
        data.requiresSafetyConfirmation ||
        data.procedure.safetyConfirmationRequired
      ) {
        const accepted = await confirm(
          {
            assetTag: data.assetTag,
            title: data.procedure.title,
            source: data.procedure.source,
            message: data.message,
          },
          signal,
        );
        if (!accepted || signal.aborted)
          return {
            isError: false,
            result: {
              found: true,
              requiresSafetyConfirmation: true,
              message:
                'Safety was not confirmed in the workspace. No procedure steps were released. Ask the technician whether they want to retry when ready.',
            },
            summary: 'Safety not confirmed. Procedure steps remain locked.',
          };
        const original = data.procedure;
        data = await fetchProcedure(parsed.data, true, signal);
        if (!data.found)
          return { isError: false, result: data, summary: data.message };
        if (
          data.requiresSafetyConfirmation ||
          data.assetId !== parsed.data.asset_id ||
          data.procedure.key !== original.key ||
          data.procedure.source !== original.source ||
          data.procedure.title !== original.title ||
          data.procedure.summary !== original.summary ||
          data.procedure.safetyLevel !== original.safetyLevel
        )
          throw new Error('Procedure changed; request again');
      }
      if (signal.aborted) throw new Error('Cancelled');
      return {
        isError: false,
        result: data,
        summary: `${data.assetTag} · ${data.procedure.title}`,
        source: data.procedure.source,
        details: data.procedure.steps.map(
          (step, index) => `${index + 1}. ${step}`,
        ),
      };
    } catch {
      return {
        isError: true,
        result: {
          error:
            'Approved procedure unavailable or changed. No steps were released. Request it again; never invent steps.',
        },
        summary: 'Procedure unavailable. Please request it again.',
      };
    }
  };
}
