# Publication checklist

- Keep the canonical development repository private; create a new mirror.
- Rotate production signing, capability, database, Redis, ML, SMS, and
  deployment credentials. Verify new values before revoking old values.
- Invalidate existing sessions, management links, and printed table QR codes.
- Scan canonical history, releases, workflow artifacts, and the export with
  Gitleaks, TruffleHog, GitHub secret scanning, and an entropy scanner.
- Run dependency, CodeQL, container, and SBOM gates; require zero known high or
  critical dependency vulnerabilities.
- Verify the export contains no environment files, agent settings, notebooks,
  deployment state, internal roadmaps/evidence, absolute machine paths, or
  unmanifested media.
- Review every exported file manually. Use a GitHub noreply identity for the
  user's mirror commits and enable private vulnerability reporting and push
  protection.

Credential revocation comes before any history cleanup. Rewriting history is
not credential revocation.
