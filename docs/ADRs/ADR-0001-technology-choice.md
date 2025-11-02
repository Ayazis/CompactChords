# ADR-0001: Technology Choice

## Context
Need static distribution and printable output.

## Decision
HTML/CSS with `@media print` and CSS columns; no client PDF engine in MVP.

Node + npm for dependency management.

TypeScript for type safety and modular organization.

Jest for unit and property testing.

Vite or esbuild for bundling and serving during development.

Output as static assets: index.html, bundle.js, style.css.


## Consequences
Fast, simple; exact pagination control limited; acceptable for MVP.
