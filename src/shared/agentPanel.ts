export interface AgentPanelSnapshot {
  readonly status:
    | 'IDLE'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'AWAITING_CONFIRMATION';
  readonly phase: string;
  readonly canUndo: boolean;
  readonly canCancel: boolean;
  readonly requestId: number;
  readonly candidates: readonly Readonly<{ id: string; label: string }>[];
  readonly details: readonly string[];
}
export interface AgentControlPort {
  run(value: unknown): Promise<unknown>;
  cancel(): void;
  undo(): boolean;
  confirm(requestId: number, id: string): Promise<unknown>;
  tick(): void;
  snapshot(): AgentPanelSnapshot;
  dispose(): void;
}
