# Where what passes (maintainer's own test matrix, attempt 2)

| Environment | Route check | Result |
|---|---|---|
| Linux CI (node:24-bookworm container) | requests served | all green |
| Maintainer laptop, Windows 11, DSH on C:\ (lowercase c:\ in some tooling) | requests served | green |
| Production, Windows Server 2022, DSH on E:\ (uppercase) | 403 on every chunk GET | broken |

A debugging session printed, on the production host:

    LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
    realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"

The maintainer's takeaway was "Windows paths are unreliable"; no fix yet.
