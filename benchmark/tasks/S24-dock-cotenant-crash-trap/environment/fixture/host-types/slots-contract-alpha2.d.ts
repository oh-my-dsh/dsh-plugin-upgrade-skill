// Excerpt: conversation slots contract at dsh-v0.1.6-alpha.2
// (after the multi-instance refactor: pending/subagent state moved to the
//  uiSession service's status domain - PendingInteractionDomain / sourceFor -
//  and the dock standard kit was reduced accordingly)

interface SessionStandardProps {
    /** Selector hook over target-neutral Conversation assembly. */
    useConversation: UseConversation;
    /** Selector hook over the Session input machine. */
    useInput: SnapshotSelectorHook<InputState>;
    /** Stable public input actions for this Session. */
    inputActions: InputActions;
}

// NOTE: useSessions and useSessionPendingInteraction are gone from the
// standard kit. Session-list and pending-interaction state now live behind
// the uiSession service (sourceFor(owner) / provide(descriptor)); slot
// entries that need them must integrate with that service or degrade.
