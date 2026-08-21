/**
 * NOKIADEMON content model.
 * Real data per project — no filler stats. CTA type is honest (see brief §4):
 *   external  → opens a live site/app
 *   source    → opens a public repo
 *   status    → a status line, not a disguised dead button
 *
 * PID readout is a STABLE hash of the project id, so it means the same thing
 * every visit (brief §4). uptime is authored, not random.
 */

// Deterministic 16-bit hex from a string — stable across visits.
function pid(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return "0x" + (h & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

export const PROJECTS = [
  {
    id: "orion",
    ring: "A",
    category: "Apps",
    name: "Orion Terminal",
    glyph: "オ",
    color: "#4DE8FF",
    thesis: "Visual AI Harness and WorkStation",
    description:
      "One desktop shell fusing a terminal, an editor, and a research companion into a single surface, with a context-aware model embedded in each so the tools reason about what you are doing. Built native for speed and offline trust rather than another browser tab.",
    stack: ["Tauri 2", "React 19", "TypeScript", "Rust", "R3F", "xterm", "Monaco"],
    role: "Design, systems architecture, full build",
    status: "RUNNING",
    statusNote: "beta v1 · open beta · macOS Apple Silicon",
    uptime: "14MO",
    coreShift: 5.0, // R.O.S.I.E owns the stage — core drifts to the frame edge
    cta: {
      kind: "external",
      label: "Visit Open Beta",
      href: "https://orion-terminal-delta.vercel.app/",
    },
  },
  {
    id: "ekko",
    ring: "A",
    category: "Apps",
    name: "EKKO",
    glyph: "エ",
    color: "#B46BFF",
    thesis: "An invite-only network where taste matches taste.",
    description:
      "Creatives and the people who hire them connect by swiping on each other's work, not on selfies and not through a feed. Every profile is a small self-made site; a mutual right-swipe opens a private channel. Invite-only by design to keep the signal high.",
    stack: ["Next.js", "Turborepo", "TypeScript", "Supabase", "Radix", "iOS"],
    role: "Product design, brand, engineering",
    status: "RUNNING",
    statusNote: "private beta · iOS v2.0.6",
    uptime: "9MO",
    cta: { kind: "external", label: "Visit Project", href: "https://ekkoconnect.app" },
  },
  {
    id: "joust",
    ring: "B",
    category: "Tools",
    name: "Joust",
    glyph: "闘",
    color: "#1B3A6B",
    thesis: "A framework for adversarial multi-agent reasoning.",
    description:
      "Two AI agents charge at each other in structured passes: one fires a payload, the other counters, and a neutral Herald scores every exchange before declaring a winner. Forcing each side to attack and defend specific claims produces a sharper answer than a single prompt. Every duel saves as a replayable file.",
    stack: ["TypeScript", "Node 20", "Anthropic SDK", "OpenAI", "Commander", "Zod"],
    role: "Author, CLI + framework design",
    status: "RUNNING",
    statusNote: "public · npm: joustx",
    uptime: "5MO",
    cta: { kind: "external", label: "Launch Joust", href: "https://chakra3301.github.io/AI-JOUSTING/" },
  },
  {
    id: "widow",
    ring: "B",
    category: "Tools",
    name: "Black Widow",
    glyph: "蛛",
    color: "#FF3B5C",
    thesis: "A predatory intelligence-operations CLI for other AI agents.",
    description:
      "It treats models the way a widow treats prey. Merge absorbs several agents into one survivor, Hunt races two models and kills the loser, and Trap infiltrates a target through cooperative-looking probes to reconstruct its capabilities and likely system prompt. Every operation streams live and lands as a portable autopsy file.",
    stack: ["TypeScript", "Node 20", "Anthropic SDK", "OpenAI", "ESM"],
    role: "Author, agent-ops design",
    status: "RUNNING",
    statusNote: "public · npm: blackwidowx",
    uptime: "4MO",
    coreShift: 3.6, // give the web room to read against the dark
    cta: { kind: "source", label: "View Source", href: "https://github.com/chakra3301" },
  },
  {
    id: "finders",
    ring: "C",
    category: "Sites",
    name: "Finders x Keepers",
    glyph: "探",
    color: "#E8C468",
    thesis: "Concierge sourcing from Japan, settled through escrow.",
    coreShift: 4.2, // the dither Charizard owns the stage — core drifts wide
    description:
      "Buyers outside Japan post what they want, set a budget and a minimum condition, and pay into escrow. The service sources the item, sends proof, ships on approval, and only gets paid once it is in transit. A calm fintech surface over a real sourcing pipeline.",
    stack: ["Next.js 16", "TypeScript", "Tailwind v4", "shadcn/ui", "Supabase", "Stripe"],
    role: "Product design, full-stack build",
    status: "RUNNING",
    statusNote: "live",
    uptime: "3MO",
    cta: { kind: "external", label: "Visit Project", href: "https://findersxkeepers.com" },
  },
  {
    id: "life",
    ring: "C",
    category: "Sites",
    name: "life.exe",
    glyph: "生",
    color: "#4E8CFF",
    thesis: "A research-compound storefront built around evidence, safety, and lot-level documentation.",
    description:
      "A privacy-first prototype storefront for research compounds. Each product pairs a molecular visualization with cited literature, evidence limits, safety boundaries, and lot-level documentation. Research-only restrictions stay visible throughout, and the product copy excludes dosing, administration, treatment, and diagnostic guidance.",
    stack: ["Vite 8", "JavaScript", "Three.js", "GSAP", "WebGL", "Canvas"],
    role: "Concept, product design, full build",
    status: "PROTOTYPE",
    statusNote: "live prototype · research use only",
    uptime: "1MO",
    coreShift: 4.4, // fluid field + molecular pair own the open side of the stage
    cta: { kind: "external", label: "Enter life.exe", href: "https://life-exe-eight.vercel.app/" },
  },
  {
    id: "bonkler",
    ring: "C",
    category: "Sites",
    name: "Bonkler Battle",
    glyph: "ボ",
    color: "#00B8A9",
    thesis: "Build a janky Bonkler, tune its loadout, and battle your way up the ranks.",
    description:
      "A retro browser fighting game built around the Bonklers NFT collection. Players can enter instantly with local demo fighters, connect a Solana wallet for collection units, swap seven layers of equipment, buy components, and run turn-based AI battles with persistent progression and a leaderboard system. The Windows 2000 shell stays responsive, keyboard-accessible, and reduced-motion safe.",
    stack: ["JavaScript", "Canvas 2D", "Express", "PostgreSQL", "Solana", "Helius"],
    role: "Game design, systems architecture, full build",
    status: "LIVE",
    statusNote: "live · build 1.8.1 · instant demo mode",
    uptime: "1MO",
    coreShift: 4.7,
    cta: { kind: "external", label: "Play Bonkler Battle", href: "https://bonkler-game.vercel.app/" },
  },
  {
    id: "dia",
    ring: "C",
    category: "Sites",
    name: "Dead Internet Archive",
    glyph: "骸",
    color: "#6BFF8E",
    thesis: "A demo storefront broadcast from a dead CRT.",
    description:
      "A zero-backend storefront for artifacts from the digital void. The sticker-covered CRT cycles live channels before opening a ten-item catalog, persistent local cart, and deliberately offline checkout.",
    stack: ["HTML", "CSS", "JavaScript", "WebP", "Vercel"],
    role: "Concept, art direction, design, full build",
    status: "LIVE DEMO",
    statusNote: "live demo storefront · payments offline",
    uptime: "1MO",
    cta: { kind: "external", label: "Enter Demo Store", href: "https://dead-internet-archive-demo.vercel.app/" },
  },
];

// Attach the stable PID readout string.
for (const p of PROJECTS) {
  p.pid = pid(p.id);
  p.readout = `PID ${p.pid} · STATUS: ${p.status} · UPTIME: ${p.uptime}`;
}

export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

// Ring definitions (brief §2.3). Radius grows outward A→B→C.
export const RINGS = {
  A: { id: "A", label: "APPS", radius: 3.1, projects: ["orion", "ekko"] },
  B: { id: "B", label: "TOOLS", radius: 4.35, projects: ["joust", "widow"] },
  C: { id: "C", label: "SITES", radius: 5.6, projects: ["finders", "life", "bonkler", "dia"] },
};

// Root-terminal contact block (brief §2.6). Placeholders flagged for the operator.
export const CONTACT = {
  x: { label: "x", href: "#", value: "@chakra3301" },
  linkedin: { label: "linkedin", href: "#", value: "in/lucaorion" },
  email: { label: "email", href: "mailto:hello@nokiademon.dev", value: "hello@nokiademon.dev" },
};

// notes.txt — operator writes this directly (brief §7). Honest placeholder.
export const NOTES =
  "eight processes, one operator. building instruments that think.\nmost of this runs in private beta. knock if you want in.";
