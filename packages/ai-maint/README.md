# AI maintenance helpers

This package will house richer AI-driven maintenance scripts and utilities. The scheduled workflow currently performs guarded copy updates directly in CI; additional tooling (OpenAI orchestrators, sitemap/link graph analyzers, etc.) can live here as the automation grows.

## @goldshore/ai-maint

Node scripts and prompts that support the scheduled AI maintenance workflow. Extend this package with utilities for copy review, link graph validation, and other guardrailed automation before enabling richer OpenAI-powered edits.
