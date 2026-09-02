# H12 fixture · wrongly-bounded session-rename helper

Benchmark-only fixture: **private:true, must not be published**. A static, read-only
copy of a client-plane session-rename helper whose alpha.2 error-code vocabulary is
already migrated (namespaced codes), but whose `RemoteResult` control-flow boundary
is wrong in several ways this task tests: it assumes ordinary failures reject into
catch, reads `result.value` without checking `result.ok`, discriminates with
`instanceof RemoteError`, and converts genuine assembly/programming rejects into a
retry loop.

It is not executable (dsh is not installed in this task's environment), and it
contains the answer's trap, not the answer.
