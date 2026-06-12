# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-06-12

### Removed

- Removed the functional helper wrapper `runSelfHealingLoop` in favor of using the cleaner and more readable `SelfHealingLoop` class directly.

## [1.0.1] - 2026-06-12

### Changed

- Simplified `README.md` to a single high-impact happy-path example.
- Migrated advanced usage and api reference to `docs/USAGE.md`.

## [1.0.0] - 2026-06-12

### Added

- Initial release of the library.
- Integrated publishing script and CI/CD GitHub Actions workflow.
- Standardized package build output (TypeScript declaration files, source maps, and ES modules).
- Refactored comments and types to strictly comply with coding guidelines and strict typing.
