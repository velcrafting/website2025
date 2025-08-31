// gen-thumb-prompt.mjs
import readline from "node:readline";

const KIT = {
  base_character:
    "Cartoon illustration of a friendly professional man with short brown hair, glasses, light beard, and casual-smart style (short-sleeve button shirt, jeans, brown shoes). Full body, clean modern vector art style with bold outlines, flat colors, and subtle shading. Simplified but recognizable features. Consistent reusable mascot style designed for web thumbnails. Character placement: right or center-right of the frame. Left side has open space for text or category banner. Minimal background for clarity. 16:9 aspect ratio, designed for readability at small sizes.",
  sections: {
    labs: {
      thumbnail:
        "Use the base_character. Theme: futuristic tech or lab. The character is shown interacting with [PROJECT THEME]. Examples: holding a glowing QR code, coding at a desk with floating stock charts, mixing chemicals in a lab flask with HTML tags bubbling out. Background accent color: teal or cyan gradient. Add subtle glowing tech icons, holograms, or gadgets floating around. Frame designed for Labs category thumbnail.",
      palette: {
        primary: "#06B6D4",
        secondary: "#0E7490",
        accent: "#67E8F9",
        background: "#022C3A",
      },
    },
    writing: {
      thumbnail:
        "Use the base_character. Theme: editorial or creative writing. The character is surrounded by books, digital notepads, floating text bubbles, or a large glowing pen icon. Background accent color: warm orange or golden gradient. Add subtle page and idea icons. Frame designed for Writing category thumbnail.",
      palette: {
        primary: "#F59E0B",
        secondary: "#B45309",
        accent: "#FCD34D",
        background: "#451A03",
      },
    },
    projects: {
      thumbnail:
        "Use the base_character. Theme: builder or creator. The character is working with blueprints, gears, glowing interface panels, or futuristic tools. Background accent color: deep blue or purple gradient. Add subtle UI wires or circuit elements. Frame designed for Projects category thumbnail.",
      palette: {
        primary: "#3B82F6",
        secondary: "#1E40AF",
        accent: "#818CF8",
        background: "#111827",
      },
    },
  },
  styling_flags: [
    "flat vector style",
    "bold outlines with subtle shading",
    "minimal background clutter",
    "character on right side of frame",
    "open text space on left for labels",
    "consistent mascot proportions across sections",
    "optimized for readability at thumbnail scale",
  ],
};

function buildPrompt({ section, theme, keywords }) {
  const S = KIT.sections[section];
  const themeText =
    section === "labs"
      ? S.thumbnail.replace("[PROJECT THEME]", theme || "a relevant device or artifact")
      : S.thumbnail;

  const kw = keywords ? ` Keywords: ${keywords}.` : "";

  return [
    KIT.base_character,
    themeText,
    `Color palette. Primary ${S.palette.primary}, Secondary ${S.palette.secondary}, Accent ${S.palette.accent}, Background ${S.palette.background}.`,
    `Styling flags: ${KIT.styling_flags.join(", ")}.`,
    "Design for a clean thumbnail with high readability.",
    kw,
  ].join(" ");
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) {
  return new Promise((res) => rl.question(q, (a) => res(a.trim())));
}

(async () => {
  console.log("Pick a section:");
  console.log("1) labs");
  console.log("2) writing");
  console.log("3) projects");
  const choice = await ask("> ");

  const map = { "1": "labs", "2": "writing", "3": "projects", labs: "labs", writing: "writing", projects: "projects" };
  const section = map[choice];
  if (!section) {
    console.error("Invalid selection.");
    rl.close();
    process.exit(1);
  }

  let theme = "";
  if (section === "labs") {
    theme = await ask("Provide theme. Example: holding a glowing QR code\n> ");
  }

  const keywords = await ask("Optional keywords or project summary. Press Enter to skip\n> ");
  const prompt = buildPrompt({ section, theme, keywords });

  console.log("\n=== Generated Prompt ===\n");
  console.log(prompt);
  console.log("\n=== Copy above into your image generator ===\n");

  rl.close();
})();
