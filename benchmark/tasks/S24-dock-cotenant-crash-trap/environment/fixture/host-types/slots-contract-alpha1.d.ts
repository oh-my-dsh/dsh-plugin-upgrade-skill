// Excerpt: conversation slots contract at dsh-v0.1.6-alpha1
// (standard props the shell hands every 'conversation.input.dock' entry)

interface SessionStandardProps {
    /** Selector hook over target-neutral Conversation assembly. */
    useConversation: UseConversation;
    /** Global session-list selector (byId index for subagent walks). */
    useSessions: SnapshotSelectorHook<SessionListState>;
    /** Pending human interactions by session id. */
    useSessionPendingInteraction: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>;
    /** Selector hook over the Session input machine. */
    useInput: SnapshotSelectorHook<InputState>;
    /** Stable public input actions for this Session. */
    inputActions: InputActions;
}
