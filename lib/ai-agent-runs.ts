import { createServiceClient } from './supabase';

/**
 * Журнал запусків ШІ-агентів (таблиця ai_agent_runs, міграція 125).
 * Запис необовʼязковий: якщо таблиці ще немає або БД не відповіла, агент усе
 * одно повертає результат — журнал не має ламати роботу менеджера.
 */

export type AgentRunLog = {
  agent: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  durationMs?: number;
  error?: string | null;
  createdBy?: string | null;
};

export async function logAgentRun(run: AgentRunLog): Promise<string | null> {
  try {
    const db = createServiceClient();
    const { data, error } = await db.from('ai_agent_runs').insert({
      agent: run.agent, input: run.input, output: run.output ?? null, model: run.model,
      cost_usd: run.costUsd, input_tokens: run.inputTokens, output_tokens: run.outputTokens,
      tool_calls: run.toolCalls, duration_ms: run.durationMs ?? null, error: run.error ?? null,
      created_by: run.createdBy ?? null,
    }).select('id').single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (err) {
    console.error('[ai-agent-runs] log failed (міграція 125?):', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function markAgentRunOutcome(runId: string, outcome: string, ref?: string | null): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from('ai_agent_runs')
      .update({ outcome, outcome_ref: ref ?? null, outcome_at: new Date().toISOString() })
      .eq('id', runId);
  } catch (err) {
    console.error('[ai-agent-runs] outcome failed:', err instanceof Error ? err.message : err);
  }
}
