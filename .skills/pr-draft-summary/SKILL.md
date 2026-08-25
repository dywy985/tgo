---
name: pr-draft-summary
description: Generate a PR change summary grouped by service after work is finished. Trigger when wrapping up a task and ready to commit or create a pull request — reads git diff and git log, groups changed files by service directory, and outputs a markdown-formatted summary with file lists, commit history, and diff stats.
---

# pr-draft-summary

## Purpose
Generate a markdown PR summary grouped by service, based on git diff and commit log.

## Trigger
When work is finished and ready to commit/PR.

## What it does
1. Reads `git diff` and `git log` for the current branch
2. Groups changed files by service directory
3. Outputs a markdown-formatted change summary

## Usage
```bash
bash .skills/pr-draft-summary/scripts/summary.sh
```
