# ADR 0001: Keep The MCP Portable And Read-Only

Status: accepted

## Context

The first prototype mixed personal assistant behavior, event ingestion, policy,
approval, audit, CI/CD, scripts, and observability into one planned product.
That shape was difficult to deploy, difficult to explain, and coupled a public
tool protocol to one private infrastructure environment.

## Decision

This repository owns only a portable observability MCP server. It does not own
an LLM, chat gateway, webhook bridge, deployment workflow, or infrastructure
credentials. Version 1 exposes read-only evidence tools.

Deployment-specific configuration belongs outside this repository. Private
agents may consume this server without becoming part of the public project.

## Consequences

- The server can be used by multiple agent products.
- Public release does not reveal private topology.
- Event ingestion and Discord behavior require a separate runtime component.
- Mutating DevOps actions require a later, independently reviewed boundary.
