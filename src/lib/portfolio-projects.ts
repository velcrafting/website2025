export type ProjectStatus =
  | "live"
  | "active"
  | "prototype"
  | "draft"
  | "local-only"
  | "hackathon";

export type ProjectLane = {
  id: string;
  title: string;
  summary: string;
};

export type PortfolioProject = {
  slug: string;
  name: string;
  lane: string;
  summary: string;
  proves: string;
  stack: string[];
  status: ProjectStatus;
  links: {
    label: string;
    href: string;
  }[];
  featured?: boolean;
};

export const projectLanes: ProjectLane[] = [
  {
    id: "agent-workbenches",
    title: "Agent workbenches",
    summary:
      "Interfaces and orchestration layers that make agent runs inspectable, resumable, and easier to operate.",
  },
  {
    id: "local-first-ai",
    title: "Local-first AI / ML",
    summary:
      "Privacy-sensitive AI prototypes that keep evidence, review, and model boundaries close to the operator.",
  },
  {
    id: "simulation-systems",
    title: "Simulation systems",
    summary:
      "Synthetic worlds and long-running agents with memory, state, deterministic rules, and auditable consequences.",
  },
  {
    id: "mcp-tooling",
    title: "MCP / tooling",
    summary:
      "Purpose-built tools, local workers, and capability boundaries for coding agents and AI workflows.",
  },
  {
    id: "authority-governance",
    title: "Authority / governance",
    summary:
      "Scaffolds for reducing hidden trust: explicit source-of-truth boundaries, review gates, and receipts.",
  },
  {
    id: "trading-control-planes",
    title: "Trading / control planes",
    summary:
      "Operator-supervised trading runtimes where risk, replay, telemetry, and execution authority stay visible.",
  },
];

export const portfolioProjects: PortfolioProject[] = [
  {
    slug: "commandcode-ui",
    name: "CommandCode-UI",
    lane: "agent-workbenches",
    status: "active",
    featured: true,
    summary:
      "Native-feeling desktop workbench for a terminal-first coding agent, with PTY health, sessions, permission state, and receipts surfaced in the UI.",
    proves:
      "A CLI agent can remain the execution source of truth while the operator gets a calmer cockpit for setup, runtime state, and diagnostics.",
    stack: ["Electron", "React", "TypeScript", "PTY", "local receipts"],
    links: [
      { label: "Repo", href: "https://github.com/Vel-Labs/CommandCode-UI" },
    ],
  },
  {
    // The slug and display name were "aol" / "AOL" until 2026-09-17. The candidate profile states that
    // the internal codename "must not be used as the public project name", and the public index was
    // publishing it — a truthfulness and privacy defect, not a wording preference. Both are now the
    // descriptive phrase the profile itself uses for this work ("private agent-orchestration and
    // operator workbench"), so nothing is invented and the codename is gone.
    //
    // NOTE: the slug changed, so any URL that pointed at the old one is broken. Nothing else in this
    // repository referenced it (checked 2026-09-17).
    slug: "agent-orchestration-workbench",
    name: "Agent orchestration workbench",
    lane: "agent-workbenches",
    status: "local-only",
    summary:
      "Agent Orchestration Layer for local profiles, shared filesystem state, MCP access, ACP control paths, hooks, and reusable workflow packaging.",
    proves:
      "Agent continuity can be grounded in durable workspace state and explicit control paths instead of fragile chat memory.",
    stack: ["TypeScript", "MCP", "ACP", "filesystem memory", "profiles"],
    links: [],
  },
  {
    slug: "caresight",
    name: "CareSight",
    lane: "local-first-ai",
    status: "hackathon",
    featured: true,
    summary:
      "Local-first caregiver awareness prototype for home observations, human review, journaling, and bounded handoff paths.",
    proves:
      "Sensitive care events can be modeled as local, inspectable records before any external alert or handoff is approved.",
    stack: ["Python", "MLX", "SQLite", "local vision", "human review"],
    links: [
      { label: "Repo", href: "https://github.com/Vel-Labs/CareSight" },
    ],
  },
  {
    slug: "yolo26-mlx-swift",
    name: "yolo26-mlx-swift",
    lane: "local-first-ai",
    status: "prototype",
    summary:
      "Swift port work around YOLO26 MLX for Apple-platform local vision experiments.",
    proves:
      "Local model capability can move closer to the app runtime instead of being treated as a remote service by default.",
    stack: ["Swift", "MLX", "local vision", "Apple platforms"],
    links: [
      { label: "Repo", href: "https://github.com/Vel-Labs/yolo26-mlx-swift" },
    ],
  },
  {
    slug: "civulacrum",
    name: "Civulacrum",
    lane: "simulation-systems",
    status: "active",
    featured: true,
    summary:
      "Local-first synthetic society lab where citizens have identity, memory, needs, jobs, beliefs, relationships, and long-horizon consequences.",
    proves:
      "LLM-backed cognition can sit behind deterministic world rules, validators, event logs, and file-backed state instead of becoming the world engine.",
    stack: ["Python", "agent simulation", "file-backed state", "validators"],
    links: [],
  },
  {
    slug: "vel-mcp",
    name: "vel-mcp",
    lane: "mcp-tooling",
    status: "active",
    featured: true,
    summary:
      "Modular MCP tooling scaffold for local or cloud-backed senses: vision/OCR/grounding, control, brain, speech, and privacy gateway layers.",
    proves:
      "Agent tools can be split by trust boundary so each capability has its own permission surface, worker lifecycle, artifacts, and audit trail.",
    stack: ["TypeScript", "MCP", "local workers", "vision evals", "audit logs"],
    links: [
      { label: "Repo", href: "https://github.com/Vel-Labs/vel-mcp" },
    ],
  },
  {
    slug: "clearintent",
    name: "ClearIntent",
    lane: "authority-governance",
    status: "hackathon",
    featured: true,
    summary:
      "Authority layer for autonomous agents that turns intents into scoped, signable, auditable actions on EVM chains.",
    proves:
      "Agent execution can be wrapped in intent schemas, policy checks, identity, signing surfaces, provider evidence, and explicit gaps.",
    stack: ["TypeScript", "EVM", "EIP-712", "ENS", "0G", "KeeperHub"],
    links: [
      { label: "Repo", href: "https://github.com/Vel-Labs/ClearIntent" },
    ],
  },
  {
    slug: "thc-methodology",
    name: "thc-methodology",
    lane: "authority-governance",
    status: "active",
    summary:
      "Project-agnostic reliability methodology for surfacing hidden trust in software systems, docs, and agentic workflows.",
    proves:
      "Truth, Hardening, and Clarity can become a reusable review language for source-of-truth boundaries, claims, and operator readiness.",
    stack: ["docs", "templates", "scorecards", "local audit skills"],
    links: [
      { label: "Repo", href: "https://github.com/Vel-Labs/thc-methodology" },
    ],
  },
  {
    slug: "project-scaffold",
    name: "project-scaffold",
    lane: "authority-governance",
    status: "active",
    summary:
      "Reusable governance scaffold for fast-moving open-source, hackathon, and AI-assisted projects.",
    proves:
      "A repo can start with contracts, decisions, audits, quality gates, and agent instructions before implementation pressure blurs authority.",
    stack: ["TypeScript", "contracts", "templates", "quality gates"],
    links: [
      { label: "Repo", href: "https://github.com/Vel-Labs/project-scaffold" },
    ],
  },
  {
    slug: "grease-trap-trading",
    name: "Grease Trap Trading OS",
    lane: "trading-control-planes",
    status: "draft",
    summary:
      "Operator-supervised trading control plane for venue-specific engines under shared event, risk, telemetry, replay, and frontend contracts.",
    proves:
      "Trading systems can be folded into a shared evidence spine without hiding venue-specific execution authority.",
    stack: ["TypeScript", "Python", "event contracts", "risk kernel", "replay"],
    links: [],
  },
  {
    slug: "polymarket-velbagool",
    name: "Polymarket Velbagool",
    lane: "trading-control-planes",
    status: "local-only",
    summary:
      "Rust Polymarket binary-market runtime with file-backed state, reporting/export binaries, dashboard surface, and clean-room contract boundaries.",
    proves:
      "A live-oriented trading runtime can keep active state, strategy routing, reports, and operational contracts inspectable.",
    stack: ["Rust", "Axum", "Polymarket CLOB", "file-backed state"],
    links: [],
  },
  {
    slug: "risqpost",
    name: "Risqpost",
    lane: "authority-governance",
    status: "prototype",
    summary:
      "Social risk analysis case study from the earlier portfolio era, retained as a long-form example of dashboarded risk triage.",
    proves:
      "The existing MDX case-study path can still host deeper writeups while the public index moves toward systems proof.",
    stack: ["Next.js", "FastAPI", "Supabase", "OpenAI", "dashboards"],
    links: [{ label: "Writeup", href: "/projects/risqpost" }],
  },
];

export function laneById(id: string) {
  return projectLanes.find((lane) => lane.id === id);
}

export function featuredProjects() {
  return portfolioProjects.filter((project) => project.featured);
}
