// Excerpt: @deepseek-ai/dsh-api-session-controller types at dsh-v0.1.6-alpha.2
// (after the multi-instance session refactor — release note: "客户端 Session 会话
// 支持多实例共存，相关 API 及 slot 有变化")

export interface SessionListSnapshot {
    items: readonly SessionListEntry[];
    state: 'idle' | 'loading' | 'error';
    phase: SessionListPhase;
    error: RemoteFailure | null;
    subagentsByParent: Readonly<Record<SessionId, SubagentCatalogSnapshot>>;
    /** Background jobs per session; an absent key is an empty set. */
    jobsBySession: Readonly<Record<SessionId, readonly JobView[]>>;
}

export interface ISessions {
    /** Host catalog and local reference-source counts; navigation belongs to view owners. */
    readonly list: ObservableSnapshot<SessionListSnapshot>;
    /**
     * Retain an exact Client generation and start its shared initial history opening.
     * @param target - known identity or durable direct-parent address.
     */
    retain(target: SessionTarget, options: SessionRetainOptions): SessionReference;
    // ... using, retainInfo omitted for brevity
    // NOTE: scope(id) still exists on ISessions at alpha.2 but is omitted from
    // this excerpt; the ui-session service's binding value also carries the
    // session-scoped ctx (see ui-session-service-alpha2.d.ts).
}
