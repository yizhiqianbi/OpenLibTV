---
name: penstudio
version: 0.1.0
description: Use the local PenStudio MCP tools to inspect routes and public representative content.
---

Use the `penstudio` MCP server when a task needs route discovery, public snapshot lookup, or a search across the local PenStudio content fixtures.

The server is read-only. It does not authenticate users, modify browser-local projects, upload media, create generation tasks, charge credits, or publish content. State those limits when a request depends on one of those services.

Prefer `search_content` to locate a record, then `get_content` to inspect the selected record. Use `resolve_route` before describing how a URL is handled.
