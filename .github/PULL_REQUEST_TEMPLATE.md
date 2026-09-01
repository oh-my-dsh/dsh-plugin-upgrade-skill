## Summary

Describe the single logical change and link the related Issue, card, or version corridor.

## Scope Checklist

- [ ] I checked existing Issues and PRs for overlap and coordinated any related work.
- [ ] For version-specific work, I used exact DSH tags or commit hashes, not `latest` or inferred versions.
- [ ] I cited fixed first-party sources for version-specific claims.
- [ ] For migration or card work, I listed the affected touchpoints (`#1`-`#7`) and complete card IDs.
- [ ] I kept Host, Web Client, and ordinary Cordis plugin faces distinct.
- [ ] For benchmark result or validation-report PRs, the report states the consumed tokens and the total run duration per round (as recorded by Harbor's trial outputs).

## Verification

Commands run:

```text
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

Additional checks:

- [ ] I ran the focused tests or example checks for the changed behavior.
- [ ] I reviewed the complete diff and `git diff --check`.

Unverified boundaries (providers, browsers, operating systems, credentials, or product entry points):

<!-- State "None" or describe exactly what was not tested. -->

## Review Notes

<!-- Mention any source/runtime conflict, compatibility assumption, or follow-up work. -->
