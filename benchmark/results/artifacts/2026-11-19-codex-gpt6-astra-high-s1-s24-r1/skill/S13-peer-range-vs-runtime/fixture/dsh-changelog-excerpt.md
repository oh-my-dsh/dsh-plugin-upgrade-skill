# dsh-v0.1.2-alpha.4 release notes (excerpt)

## Other Changes

- **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`,
  and `snapshotEvents()` - the eagerly materialized events array is removed
  to reduce memory overhead in long sessions. Developers should pay attention
  to compatibility. (@kermanx)

- **Distinguish `SessionSeq` and `SessionLogOffset` with strong types** -
  developers should pay attention to compatibility. (@tianyicui)