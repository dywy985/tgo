---
name: implementation-strategy
description: Analyze change impact across services before starting implementation. Trigger before modifying runtime, API, or cross-service code — maps changed files to service ownership, outputs the dependency graph between affected services, and lists upstream/downstream sync points that may need coordinated updates.
---

# implementation-strategy

## Purpose
Analyze changed files to identify affected services, dependencies, and required sync points before implementation.

## Trigger
Before modifying runtime, API, or cross-service code.

## What it does
1. Analyzes `git diff` file paths
2. Maps files to service ownership
3. Outputs affected services and their dependency relationships
4. Lists upstream/downstream services that may need sync

## Usage
```bash
bash .skills/implementation-strategy/scripts/analyze.sh [file1 file2 ...]
```
