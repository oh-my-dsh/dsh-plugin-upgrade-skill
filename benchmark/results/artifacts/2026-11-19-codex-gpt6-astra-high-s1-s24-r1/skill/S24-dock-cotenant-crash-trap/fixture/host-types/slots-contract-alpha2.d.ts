// Excerpt: standard props the shell hands every 'conversation.input.dock' entry
// at dsh-v0.1.6-alpha.2 (session kit from the conversation slots contract, merged
// with the GlobalStandardProps that @deepseek-ai/dsh-client-ui-session adds to
// every slot after the multi-instance refactor)

interface SessionStandardProps {
    /** Selector hook over target-neutral Conversation assembly. */
    useConversation: UseConversation;
    /** Global session-list selector (byId index for subagent walks). */
    useSessions: SnapshotSelectorHook<SessionListState>;
    /** Per-session status: running, completionUnread, pendingInteraction. */
    useSessionStatus: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>;
    /** Reference counts for a Session (e.g. retainedBy.mainView). */
    useSessionRetainInfo: UseSessionRetainInfo;
    /** Selector hook over this Session's named projections (todos, usage, ...). */
    useProjection: UseProjection;
    /** Selector hook over the Session input machine. */
    useInput: SnapshotSelectorHook<InputState>;
    /** Stable public input actions for this Session. */
    inputActions: InputActions;
}
