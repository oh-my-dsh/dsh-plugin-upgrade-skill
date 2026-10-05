// Excerpt: new service shipped by @deepseek-ai/dsh-client-ui-session at
// dsh-v0.1.6-alpha.2 (client bundle exports UiSession; inject name "uiSession")

/** Root service owning per-Session bindings and the main-view selection. */
export declare class UiSession extends Service {
    private readonly sessions;
    private readonly bindings;
    /** Renderer-facing adapter for session and session-maybe slot scopes. */
    adapter: {
        /** Binding source of the main view's current session. */
        current: ObservableSnapshot<SessionBindingValue>;
        bindingSource(target: unknown): BindingSource;
    };
    /**
     * Resolve the binding source for one Session binding or identity.
     * @param source - Session binding or identity.
     * @returns stable observable binding source.
     */
    sourceFor(owner: SessionBinding | SessionId): BindingSource;
    /**
     * Register one Session-scoped standard-source contribution
     * (hook/prop roster + per-binding resolver); used by stock packages such
     * as ui-chat to publish their per-session hooks.
     */
    provide(descriptor: SessionSourceDescriptor): () => void;
}

/** Observable value materialized for one live session binding. */
export interface SessionBindingValue {
    /** The bound session's id. */
    readonly key: SessionId;
    /** The session-scoped context: services registered under this session resolve here. */
    readonly ctx: Context;
    /** Standard hooks contributed by provide() descriptors for this binding. */
    readonly hooks: Record<string, unknown>;
    readonly keyedHooks: Record<string, Record<string, unknown>>;
    readonly props: Record<string, unknown>;
}

// SessionBindingValue.key of the absent binding is undefined; the service
// publishes the absent value while no main session is retained.
