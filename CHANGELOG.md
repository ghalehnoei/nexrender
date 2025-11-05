# Changelog

All notable changes to this repository will be documented in this file.

## [Unreleased]

### Added
- Worker: in-process concurrency via `--concurrency` flag and `NEXRENDER_WORKER_CONCURRENCY` env
- Worker: local status HTTP server via `--status-port` (GET /health, GET /status)
- Worker: periodic heartbeat to server with runtime stats and `statusPort`; configurable via `--heartbeat-interval`/`NEXRENDER_WORKER_HEARTBEAT_MS`
- Server: in-memory worker registry with TTL (`NEXRENDER_WORKER_TTL_MS`)
- Server: endpoints
  - `POST /api/v1/workers/heartbeat`
  - `GET /api/v1/workers`
  - `GET /api/v1/workers/:name`
  - `GET /api/v1/workers/:name/status`
  - `GET /api/v1/workers-summary`

### Changed
- Worker: CLI adds `--concurrency`, `--status-port`, `--heartbeat-interval`
- Docs: Updated worker and server READMEs with new options and endpoints

### Binaries
- Built `server-linux` and `worker-win.exe` under `bin/`

## [1.62.x] - Upstream baseline
- See upstream changelog/releases for prior history

