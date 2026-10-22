// channel.js (dsh-tui plugin) - line 734 area
// The plugin reads the session's events array for transcript replay:

export function createChannel(ctx, initialAgent, options) {
    // ...
    const events = liveAgent.session.events;    // <- line 734
    // ...
    replayEvents(agent.session.events);          // <- line 6685
}

// line 657: const last = session.events.at(-1);
// line 2685: const events = agent.session.events;
// line 3004: const liveEvents = liveSession.events;
// ... 42 total references to `.events` on session objects