# ROOTWebMigration · Woodland Rooms / 林间议事厅

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

[简体中文](README.md) | English

Development version **v1.1.1** (package: 1.1.1-dev); the public release remains **v1.1**, and the existing v1.1.0 tag is unchanged. This update fixes Cobbler's Evening timing and battle waits with no real choice, and introduces weighted 70%/20%/10% bot thinking intervals. Longer animations finish before the next bot action. See the [development record](docs/DEVELOPMENT-1.1.1.md) (Chinese).

A self-hosted web reimplementation of ROOT's rules. The current release, **v1.1.0**, supports the autumn map, the four base-game factions, and online games for 2–4 players. Multiplayer does not depend on Steam. The original game's installation directory has not been modified.

## Expansion work in the current repository

The Lizard Cult is implemented as a separate expansion ruleset. Select the Lizard Cult mode when creating a room; 2–4 players can choose among five available factions. It includes Lost Souls and Outcast handling, rituals and conspiracies, gardens, Evening crafting, public panels, and simple bots. Existing v1.1 saves remain compatible. Deployed on November 12, 2026 (Asia/Shanghai); the release tag remains v1.1.0. See the [implementation and acceptance record](docs/LIZARD-CULT-ACCEPTANCE-2026-11-11.md) (Chinese).

The Lizard Cult tutorial now adds 19 guided nodes adapted from the original installation's Sacred Scales material, with checkpoint retries and saved progress. See the [extraction and acceptance record](docs/LIZARD-TUTORIAL-2026-11-11.md) (Chinese). Included in the November 12 deployment.

The introductory chapter, Rise of the Marquise (贵族崛起), now uses short character dialogue inside the map, contextual action prompts, focused map views, previous-line review, retries, and saved dialogue progress. The other five chapters retain their existing flow. See the [redesign record](docs/BASICS-TUTORIAL-REDESIGN-2026-11-11.md) (Chinese). Deployed on November 12, 2026. See the [deployment record](docs/DEPLOYMENT-2026-11-12.md) (Chinese).

The four-seat waiting-room redesign was deployed on November 13, 2026 (Asia/Shanghai), **pending user acceptance**: new rooms have four seats, names and factions are committed together when ready, and the host can add and configure bots in empty seats. Games can start with 2–4 participants while leaving seats empty. See the [acceptance record](docs/FOUR-SEAT-ROOMS-2026-11-12.md) (Chinese).

Tutorial camera transitions, shared map effects, and original-game UI sounds were deployed on November 13, 2026 (Asia/Shanghai). **User acceptance is pending.** See the [engineering record](docs/EXPERIENCE-IMPROVEMENTS-2026-11-13.md) (Chinese).

Follow-up feedback is also deployed as of November 13, 2026: restored large desktop announcements, longer action effects, and a three-stage Turmoil presentation. Bot pacing was subsequently adjusted in development v1.1.1 as described above. Automated regression passed; user acceptance remains pending.

## Current features

- Independent accounts, public and password-protected rooms, per-game player names, ready states, and subsequent games.
- Marquise de Cat, Eyrie Dynasties, Woodland Alliance, and Vagabond. Available Vagabond characters: Thief, Tinker, and Ranger.
- The base deck, crafting, combat, and interrupting decisions, with rules and random outcomes managed by the server.
- SQLite persistence, recovery after page refreshes or server restarts, idempotent commands, and player-specific private views.
- Simple bots, a six-chapter tutorial (58 nodes, including the Lizard Cult), administrator tools, and an image-based board.

Expansion factions other than the Lizard Cult, a second Vagabond, additional maps, expansion decks, and advanced setup are not yet implemented. Complex rule interactions have not been exhaustively compared with the original digital game's runtime behavior. The bots are basic opponents rather than mature strategic AI.

## Run locally

Requires Node.js 24.11.1 or a compatible newer version. The application uses Node's built-in SQLite support and has no third-party npm dependencies.

```powershell
npm start
```

Open <http://127.0.0.1:3000>. The default database, `data/root.sqlite`, is created on first startup.

Environment variables: `HOST`, `PORT`, `DB_PATH`, `APP_ORIGIN`, and `COOKIE_SECURE`. For LAN access, configure `HOST` and the actual `APP_ORIGIN`. Set `COOKIE_SECURE=true` when serving over HTTPS.

## Validation and backups

```powershell
npm test
npm run check
node scripts/backup.mjs
```

Tests use temporary databases. The backup script creates a consistent SQLite copy. Copying only the main database file while it is being written is not a complete backup procedure.

Browser acceptance and research tools are kept in `tools/`. Python dependencies are recorded in `research/requirements.lock.txt`; the virtual environment is excluded from Git. Some focused UI tools depend on local isolated fixtures in `audit/`, which are not included in a fresh clone.

## Project layout

| Path | Purpose |
| --- | --- |
| `backend/server.mjs` | HTTP, accounts, rooms, SQLite, SSE, and bot scheduling |
| `backend/rules/versions/` | The current four-faction engine and compatibility engines for older saves |
| `frontend/` | Pages, interactions, styles, and visual assets |
| `tests/` | Rules, API, administration, tutorial, and recovery tests |
| `tools/`, `research/` | Asset research, development validation tools, and supporting material |
| `scripts/backup.mjs` | Consistent database backups |
| `docs/交接文档.md` | Current project status and maintenance entry point, in Chinese |
| `docs/HANDOFF-2026-11-09.md` | Maintained development and maintenance history, in Chinese |

## Deployment and maintenance

The current architecture uses a single Node instance with SQLite and SSE. `Dockerfile`, `compose.yaml`, and `deploy/nginx.conf.example` are reference configurations; consult the latest handoff documentation for production maintenance. SSE notifications and rate-limit state are held in process memory, so the application cannot be scaled directly to multiple instances.

JSON API responses intentionally remain uncompressed, with explicit `Content-Length` and `Connection: close` headers. Verify complete responses over the actual public network path before changing this behavior. Historical ruleset IDs are retained for save compatibility and are independent of product version names.

## Version control scope

Git tracks source code, required web assets, tests, tools, and research material. Databases, private player acceptance data, sessions and credentials, virtual environments, caches, logs, and deployment archives are excluded. Development currently uses the `main` branch. Run the checks appropriate to each change before committing; Git pushes and production deployments are recorded separately.

## Project purpose and rights notice

This project is an unofficial web adaptation and rules reimplementation of the existing commercial game ROOT. It explores browser-based execution, interaction, and self-hosted multiplayer. It is not officially affiliated with the original rights holders and has not received their authorization, approval, or endorsement.

The artwork, game setting, and gameplay design used in this project originate from the commercial work. All associated copyrights, trademarks, and other rights remain with their respective owners. This project does not claim, assert, take ownership of, or reserve any rights in that third-party content, and has no authority to grant licenses on behalf of its rights holders.

The project-authored portions of frontend presentation, user interaction, adapted/refactored gameplay logic, AI players, and engineering documentation are licensed under the [MIT License](LICENSE), within the scope explicitly designated by the maintainer. Corresponding project-written tests and interaction acceptance scripts are included. See the [license scope](LICENSE-SCOPE.md) and [file allowlist](docs/MIT-LICENSED-FILES.json).

**All artwork and game text resources are excluded from claims of project originality and from this MIT grant.** Project-authored technical documentation is included; quoted third-party text is not. `frontend/assets/`, `frontend/asset-manifest.json`, `backend/data/`, `research/`, and other files absent from the allowlist are outside this grant.

Licensing the project's implementation under MIT does not transfer rights in the original game's assets, text, names, trademarks, or gameplay itself. The project has no authority to license that third-party content. Neither the MIT License nor this notice replaces permission from the respective rights holders. See [third-party notices](THIRD_PARTY_NOTICES.md) for known origins and exclusions.
