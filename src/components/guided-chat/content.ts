// @ts-expect-error The direct content test imports this TypeScript module with Node's strip-types loader.
import { SITE } from "../../config/site.ts";

export type GuideChoiceId =
  | "hiring"
  | "project"
  | "exploring"
  | "community"
  | "technical"
  | "communications"
  | "ai-implementation"
  | "change-path";
export type GuideStepId =
  | "welcome"
  | "hiring"
  | "project"
  | "exploring"
  | "community"
  | "technical"
  | "communications"
  | "ai-implementation"
  | "change-path";

export type GuideChoice = {
  id: GuideChoiceId;
  label: string;
};

export type GuideDestination = {
  id: string;
  label: string;
  description: string;
  href?: string;
  external?: boolean;
  unavailable?: boolean;
};

export type GuideReply = {
  id: GuideStepId;
  message: string;
  destinations: readonly GuideDestination[];
  choices: readonly GuideChoice[];
};

export const INITIAL_CHOICES = [
  { id: "hiring", label: "I'm hiring" },
  { id: "project", label: "I have a project" },
  { id: "exploring", label: "Just exploring" },
  { id: "community", label: "Looking for community" },
] as const satisfies readonly GuideChoice[];

export const CHANGE_PATH_CHOICE = {
  id: "change-path",
  label: "Back to choices",
} as const satisfies GuideChoice;

export const WELCOME_REPLY: GuideReply = {
  id: "welcome",
  message: "I can point you to the right part of the site. What brings you here?",
  destinations: [],
  choices: INITIAL_CHOICES,
};

const CHANGE_PATH_REPLY: GuideReply = {
  id: "change-path",
  message: "Sure. Choose a different path.",
  destinations: [],
  choices: INITIAL_CHOICES,
};

const BRANCH_REPLIES: Record<Exclude<GuideChoiceId, "change-path">, GuideReply> = {
  hiring: {
    id: "hiring",
    message: "For hiring or working together, start with the résumé, then choose a time if a conversation would help.",
    destinations: [
      {
        id: "resume",
        label: "View résumé (PDF)",
        description: "Download the formal résumé.",
        href: SITE.resumeUrl,
      },
      {
        id: "booking",
        label: "Schedule a chat",
        description: "Choose a time for a 30-minute conversation.",
        href: SITE.bookingUrl,
        external: true,
      },
      {
        id: "projects",
        label: "Browse projects",
        description: "See selected systems, tools, and experiments.",
        href: "/projects",
      },
    ],
    choices: [
      { id: "technical", label: "Technical delivery" },
      { id: "communications", label: "Communications & community" },
      { id: "ai-implementation", label: "AI implementation" },
      CHANGE_PATH_CHOICE,
    ],
  },
  project: {
    id: "project",
    message: "If you have a project in mind, these are the clearest next steps.",
    destinations: [
      {
        id: "projects",
        label: "Browse projects",
        description: "Review the systems and tools already in the index.",
        href: "/projects",
      },
      {
        id: "connect",
        label: "Connect",
        description: "Save contact details, schedule, or send a note.",
        href: "/connect",
      },
      {
        id: "booking",
        label: "Schedule a chat",
        description: "Choose a time for a 30-minute conversation.",
        href: SITE.bookingUrl,
        external: true,
      },
    ],
    choices: [CHANGE_PATH_CHOICE],
  },
  exploring: {
    id: "exploring",
    message: "For a quick tour, start with projects, then browse the notebook or the tools shelf.",
    destinations: [
      {
        id: "projects",
        label: "Projects",
        description: "Inspect the project index and its working lanes.",
        href: "/projects",
      },
      {
        id: "writing",
        label: "Writing",
        description: "Read notes on AI, communication, and building in public.",
        href: "/blog",
      },
      {
        id: "tools",
        label: "Tools",
        description: "Explore practical utilities and experiments.",
        href: "/tools",
      },
    ],
    choices: [CHANGE_PATH_CHOICE],
  },
  community: {
    id: "community",
    message: "The newsletter and Connect page are the best public community paths right now.",
    destinations: [
      {
        id: "connect",
        label: "Newsletter and community",
        description: "Join the newsletter or find the current ways to reach out.",
        href: "/connect",
      },
      {
        id: "discord",
        label: "Discord",
        description: "Not open yet — there is no public invite to join right now.",
        unavailable: true,
      },
    ],
    choices: [CHANGE_PATH_CHOICE],
  },
  technical: {
    id: "technical",
    message: "For technical delivery, I modernized IT across five dealerships for approximately 400 users and helped reduce onboarding from several weeks to 3 days.",
    destinations: [
      {
        id: "delivery-examples",
        label: "See delivery examples",
        description: "Review selected delivery and operations work on the About page.",
        href: "/about#selected-work-title",
      },
    ],
    choices: [CHANGE_PATH_CHOICE],
  },
  communications: {
    id: "communications",
    message: "For communications and community work, I built Defensive Communications from 0→1 with response, FAQ, and visibility systems.",
    destinations: [
      {
        id: "communications-examples",
        label: "See communications examples",
        description: "Review the communications work and timeline on the About page.",
        href: "/about#timeline-title",
      },
    ],
    choices: [CHANGE_PATH_CHOICE],
  },
  "ai-implementation": {
    id: "ai-implementation",
    message: "For AI implementation, examples include an AI tutor-agent prototype, practical AI workflows, and developer tools built through Velcrafting.",
    destinations: [
      {
        id: "ai-examples",
        label: "See AI examples",
        description: "Browse selected tools and the work behind them.",
        href: "/projects",
      },
    ],
    choices: [CHANGE_PATH_CHOICE],
  },
};

export function resolveGuideChoice(choiceId: GuideChoiceId): GuideReply {
  return choiceId === "change-path" ? CHANGE_PATH_REPLY : BRANCH_REPLIES[choiceId];
}
