# ADR-0001: Technology Choice

## Context
Need static distribution and printable output.

## Decision
HTML/CSS with `@media print` and CSS columns; no client PDF engine in MVP.

## Consequences
Fast, simple; exact pagination control limited; acceptable for MVP.
