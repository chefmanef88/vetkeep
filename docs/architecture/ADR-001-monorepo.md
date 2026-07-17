# ADR-001: Use a modular monorepo

**Status:** Accepted

VetKeep uses one npm workspaces/Turborepo repository for mobile, web, shared contracts, validation, database types, and operational configuration.

This avoids premature service boundaries and keeps database/API contract changes atomic. Presentation components remain platform-specific; only domain and infrastructure logic is shared.
