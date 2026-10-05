// Excerpt: @deepseek-ai/dsh-api-session-controller types at dsh-v0.1.6-alpha.1
// (the version this plugin was written and verified against)

/** Global session-list state published by the sessions controller. */
export interface SessionListState {
    /** Session summaries by id. */
    readonly byId: Readonly<Record<SessionId, SessionSummary>>;
    /** The session the main conversation view is currently bound to. */
    readonly current: SessionId | undefined;
}

export interface ISessions {
    /** Global session-list snapshot (byId + current). */
    readonly list: ObservableSnapshot<SessionListState>;
    /**
     * Resolve the session-scoped context for one session id.
     * @param id - explicit session identity.
     * @returns the session scope, or undefined when not active in this client.
     */
    scope(id: SessionId): Context | undefined;
    // ... sessionOf, retain, using omitted for brevity
}
