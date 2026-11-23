# PeachAgent

[简体中文](README.md) · [English](README_EN.md)

<!-- doc-section:overview -->
## An AI agent development platform for complete tasks

PeachAgent is planned to bring visual workflows, agents, MCP, Skills, project instructions, context management, knowledge retrieval, evaluation, prompt optimization, and cost controls into one project, so applications can be built, run, inspected, and improved incrementally.

**Current status: requirements planning.** This repository contains a v0.1 requirements draft, roadmap, development process, and documentation diagrams. Product features have not been implemented. The project owner must confirm the requirements before technical designs are decided.

<!-- doc-section:capabilities -->
## Planned capabilities

| Capability | Intended user outcome |
|---|---|
| Projects and models | Manage projects, configure available models, hold conversations, and inspect run history |
| Visual workflows | Drag nodes, connect steps, configure conditions and data passing, and debug runs |
| Agents and MCP | Select authorized tools and complete multiple steps within task limits |
| Skills and project instructions | Read AGENTS.md and other explicitly supported instruction files; load Skill guidance and references as needed |
| Context and memory | Inspect capacity and included information; compact history while preserving goals, constraints, pending work, and evidence |
| Knowledge and RAG | Maintain documents, compare retrieval results, and answer with verifiable citations |
| Evaluation and prompts | Compare versions on fixed cases, analyze failures, evaluate optimization candidates, and select them explicitly |
| Cost and budgets | Record usage and limit tasks from the first paid call; examine cost per successful task |

These are planned capabilities. Detailed scope and acceptance criteria are in the [requirements documentation](requirements/README.md).

![PeachAgent product capability relationships](image/product-capabilities.svg)

The diagram shows relationships between product capabilities, not an approved technical architecture.

<!-- doc-section:roadmap -->
## Six-phase roadmap

| Phase | User outcome | Requirements |
|---|---|---|
| 1 | Project conversations with history, usage visibility, and budget limits | [Projects and chat](requirements/phases/phase-01-project-and-chat.md) |
| 2 | Visual workflows that can be run, debugged, and versioned | [Visual workflows](requirements/phases/phase-02-visual-workflow.md) |
| 3 | Bounded multi-step tasks using MCP, Skills, project instructions, and context management | [Agents, Skills, and context](requirements/phases/phase-03-agent-skills-context.md) |
| 4 | Evidence retrieval and cited answers from project documents | [Knowledge and RAG](requirements/phases/phase-04-knowledge-and-rag.md) |
| 5 | Quality comparisons, evaluated prompt improvements, and cost analysis | [Quality, prompts, and cost](requirements/phases/phase-05-quality-prompt-cost.md) |
| 6 | Selected enhancements for human intervention, long tasks, collaboration, and controlled execution | [Advanced collaboration and extensions](requirements/phases/phase-06-advanced-collaboration.md) |

**Phase 1 delivers the first runnable outcome. Phases 1–5 form the first complete core version. Phase 6 contains later enhancements.** All feature phases remain unconfirmed and unimplemented. Dependencies, boundaries, and review criteria are described in the [full roadmap](requirements/02-roadmap.md).

<!-- doc-section:reading -->
## Start here

The documentation is ready for review. There are no product startup commands or runtime prerequisites yet.

1. Read the [background and scope](requirements/01-product-background-and-scope.md) to confirm users and scenarios.
2. Read the [roadmap](requirements/02-roadmap.md) and phase requirements to confirm delivery order and boundaries.
3. Review [cross-cutting requirements](requirements/03-cross-cutting-requirements.md) for permissions, versions, budgets, and run records.
4. Use [acceptance and traceability](requirements/04-acceptance-and-traceability.md) to check capability coverage and task breakdown.
5. Resolve the product choices listed in [open decisions](requirements/05-decisions-and-change-log.md).

Technical designs, development tasks, and verified startup instructions will follow requirements confirmation. Detailed requirements and process documents are currently written in Chinese.

<!-- doc-section:repository -->
## Repository layout

| Directory or file | Purpose | Current boundary |
|---|---|---|
| [requirements/](requirements/README.md) | Background, roadmap, shared requirements, phase requirements, acceptance, and changes | Describes expected behavior and criteria without deciding implementation |
| technical/ | Future technical documentation | Contains only a .gitkeep placeholder; content follows requirements confirmation |
| [image/](image/README.md) | Documentation diagrams and editable sources | Product capabilities, roadmap, and development process |
| [ci/](ci/README.md) | Development process and Issue, PR, and phase-review templates | Defines the process; no automated pipeline is configured in this delivery |
| [README_EN.md](README_EN.md) | English project entry point | Kept in sync with the Chinese README |
| [LICENSE](LICENSE) | Project license | MIT |

<!-- doc-section:development -->
## Development and delivery

Follow the [development process](ci/README.md):

**Confirm requirements → create Issues → implement by Issue → open a PR → inspect and compile/build → merge into main → verify phase coverage.**

- Each development Issue has a delivery PR with requirement IDs and acceptance evidence.
- Code PRs must have no obvious errors and compile or build successfully before merging. Record results from the real build commands supplied by the project.
- Documentation-only PRs validate content, links, diagrams, and requirement mapping. Compilation is recorded as not applicable.
- At the end of each phase, check every requirement and record omissions, failures, and deferrals. Merged PRs do not automatically establish phase completion.

[Issue #1](https://github.com/Ryan-Guizhou/PeachAgent/issues/1) tracks the overall plan; [Issue #2](https://github.com/Ryan-Guizhou/PeachAgent/issues/2) tracks this documentation delivery. Candidate development tasks have not automatically become active implementation Issues.

<!-- doc-section:status -->
## Current boundaries

Product requirements are being reviewed. Frameworks, databases, interfaces, and deployment choices remain undecided. Earlier technical suggestions have not been recorded as approved decisions in this documentation.

This delivery does not implement product code, automated CI/CD, canary releases, commercial billing, or large-scale operations. Diagrams illustrate plans and processes; acceptance criteria will be executed against real feature deliveries.

<!-- doc-section:license -->
## License

This project uses the [MIT License](LICENSE).
