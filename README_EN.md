# PeachAgent

[简体中文](README.md) | [English](README_EN.md)

<!-- doc-section:overview -->
## Agent development platform for complete tasks

PeachAgent is the platform name; OTRYX Studio is the current console prototype name.

PeachAgent connects Agent and workflow design, controlled execution, knowledge retrieval, evaluation, reusable resources, and application publishing for individual developers. Each user has an independent tenant with multiple workspaces and projects, and configures their own model and tool credentials.

**The main P1 foundation implementation has been merged into main; phase acceptance remains open.** The Java API/Worker, MySQL, Redis and Vue console have passed build and local protocol-fixture integration checks. Live provider calls, failure/concurrency/performance checks and complete UI acceptance are tracked in [P1 acceptance issue #18](https://github.com/Ryan-Guizhou/PeachAgent/issues/18). P2–P7 have not been authorized to start. The browser prototype remains a reference for later phases.

- Background, complete requirements, and schedule: [Product requirements](requirements/PRD-PeachAgent.md).
- Try the existing interactions: [Prototype guide](prototype/README.md).
- Development boundaries: [Technical baseline](technical/README.md) and [review and delivery process](ci/README.md).

<!-- doc-section:quick-start -->
## Start the P1 development environment

- [Backend setup](backend/README_EN.md): complete configuration, PowerShell/Bash/IDE, API/Worker, middleware, first account/model and troubleshooting.
- [Environment template](.env.example): copy to .env and fill your own random passwords and KEK; never commit secrets.
- [Vue console setup](frontend/README_EN.md): Node.js, dependency installation and proxy settings.
- [Approved P1 technical design](technical/P1-TECHNICAL-DESIGN.md) · [Initial MySQL migration](backend/peachagent-bootstrap/src/main/resources/db/migration/V1__INITIAL_SCHEMA.sql).

## Try the prototype

After obtaining the repository, run the following from its root. Python 3 and a modern browser are required:

```bash
python3 -m http.server 8080 --directory prototype
```

Open [http://localhost:8080/src/index.html](http://localhost:8080/src/index.html). Use the demo entry or the login page's “Use demo credentials” action:

| Field | Demo value |
| --- | --- |
| Email | `demo@peachagent.local` |
| Password | `PeachAgent@2026` |

Alternatively, download [OTRYX_Studio.html](prototype/OTRYX_Studio.html) and open it in a browser. The GitHub file page displays source code.

Explore workspace and project switching, pinned resource copies, model and credential management, workflows and Agents, approval inbox, run traces, dataset evaluation, application publishing/API keys, and marketplace review. The prototype provides three themes and core Chinese/English labels. Business data stays in the local browser; external calls, credentials, and costs are simulated. See the [prototype guide](prototype/README.md) for detailed boundaries and verification status.

<!-- doc-section:architecture -->
## Product structure

| Domain | Problem addressed | Planned capabilities |
| --- | --- | --- |
| **Studio** | Fragmented configuration and resources make applications hard to maintain | Projects, Agents, workflows, models, tools and connections, Prompts/Skills, a separate knowledge library, and plugin interfaces |
| **Runtime** | Multi-step tasks are difficult to control, explain, and recover | Unified execution, context and memory, tool authorization, sandboxing, human intervention, dynamic sub-agents, and persistent tasks |
| **Quality** | It is difficult to establish whether changes improve results | User-maintained datasets, evidence annotation, per-case comparison, human review, Prompt optimization, and regression checks |
| **Operations** | Publishing, consumption, and governance are disconnected | Sa-Token identity and permissions, workspace isolation, user-owned credentials, Token/budget tracking, applications and API keys, public resource review, and deployment |

These domains describe responsibilities. Studio creates versions, Runtime records execution facts, Quality provides evidence for improvements, and Operations controls identity, publishing, and usage. Service boundaries are decided in the relevant cycle's technical review.

Confirmed constraints include access to all delivered features for personal tenants; user-owned model and tool credentials; plugins with executable code, standard forms, and custom interfaces whose changes do not require restarting all Runtime instances; and version-specific review before application templates, plugins, Skills, MCP configurations, and Prompts become public. The [PRD](requirements/PRD-PeachAgent.md) defines the complete scope.

<!-- doc-section:roadmap -->
## Seven development cycles

Each phase is one development cycle. The first six deliver the full feature scope; the seventh completes deployment and overall acceptance.

| Cycle | Deliverable | Initial development estimate |
| --- | --- | --- |
| P1 | Accounts, multiple workspaces and projects, models, chat, Prompts, basic usage tracking, and the workbench | 2–3 weeks |
| P2 | Visual workflows, variables/branches/subflows, debugging, plugin nodes, and both interface types | 3–4 weeks |
| P3 | Agents, MCP, Skills, project rules, context/memory, controlled code, and dynamic plugin versions | 4–6 weeks |
| P4 | Knowledge lifecycle, explainable RAG, citations, and retrieval baselines | 3–4 weeks |
| P5 | User-maintained datasets, multidimensional evaluation, Prompt optimization, and complete Token/cost analysis | 3–4 weeks |
| P6 | Dynamic sub-agents, advanced orchestration/recovery, knowledge enhancements, publishing/API keys, public review, and operations | 4–6 weeks |
| P7 | Docker Compose, initialization and mounts, backup/restore, upgrades, and end-to-end acceptance | 2–3 weeks |

The initial estimate is **21–30 development weeks** for one primary development stream with AI assistance, including implementation, integration, testing, and fixes. Review preparation and approval waiting time are excluded. Each cycle is re-estimated during its technical review based on the design and actual capacity. See the [PRD schedule](requirements/PRD-PeachAgent.md#release-plan) for scope, dependencies, and exit criteria.

<!-- doc-section:development -->
## Development rules

**Review the current cycle → obtain explicit user approval → develop and verify that cycle → accept its results → review the next cycle separately.**

Before each cycle, elaborate only its requirements, implementation design, and acceptance criteria. Approval of the overall PRD, a prototype merge, or acceptance of the previous cycle does not authorize the next cycle. Routine implementation within an approved scope does not require repeated confirmation. New scope or material design changes require an impact explanation and renewed review.

Keep the review and approval record in one cycle Issue, and track each development task with one Issue and one PR. Attach actual verification evidence and remaining gaps, and batch applicable regression checks according to the [delivery process](ci/README.md). [Issue #1](https://github.com/Ryan-Guizhou/PeachAgent/issues/1) tracks overall progress. Documentation and prototype deliveries do not mark production features as accepted.

<!-- doc-section:repository -->
## Documentation and source

| Path | Maintained content |
| --- | --- |
| [requirements/PRD-PeachAgent.md](requirements/PRD-PeachAgent.md) | The single requirements document: background, objectives, users, complete scope, seven-cycle schedule, and acceptance |
| [technical/README.md](technical/README.md) | Established architecture constraints, technology direction, and decisions for each cycle's review |
| [ci/README.md](ci/README.md) | Pre-development technical review, user approval, Issues/PRs, cycle acceptance, and change rules |
| [backend/](backend/README_EN.md) | P1 backend, seven modules, startup and configuration |
| [frontend/](frontend/README_EN.md) | P1 console, build and browser testing |
| [prototype/](prototype/README.md) | The runnable local prototype, HTML/CSS/JS source, implementation contracts, and verification records |

Duplicate overviews, phase specifications, and topic documents have been consolidated. The PRD preserves coverage of previous requirement identifiers; historical text remains available in Git history. Future cycles do not need separate sets of planning and design files in advance: their review Issue holds that record.

<!-- doc-section:license -->
## License

This project uses the [MIT License](LICENSE). Public resources must retain author and third-party dependency license information. The repository license does not grant uploaders redistribution rights to content owned by others.

