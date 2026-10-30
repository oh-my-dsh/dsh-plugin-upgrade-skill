#!/bin/bash
# release sync script (excerpt) — runs after every release, for each mirror
for remote in origin public mirror2; do
  # rewrite install-source orgs for the target mirror, then:
  git push --force-with-lease "$remote" HEAD:main
done
