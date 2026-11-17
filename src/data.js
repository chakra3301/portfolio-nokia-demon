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
    name: "Orion Studio",
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
      href: "https://orionterminal.app/",
    },
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
    cta: { kind: "external", label: "Launch Joust", href: "https://joust.3301studios.com/" },
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
    cta: { kind: "external", label: "Visit Black Widow", href: "https://blackwidow.3301studios.com/" },
  },
  {
    id: "forge",
    ring: "B",
    category: "Tools",
    name: "Forge Studio",
    glyph: "鍛",
    color: "#9BCB4B",
    thesis: "Build generative NFT collections from layered artwork, rarity weights, and compatibility rules.",
    description:
      "Import layered trait ZIPs, reorder the stack, set rarity and compatibility rules, preview combinations, generate a unique supply, and export images with metadata.",
    stack: ["React 19", "Vite", "Canvas 2D", "JSZip"],
    role: "Product design, full build",
    status: "LIVE",
    statusNote: "live · client-side",
    uptime: "7MO",
    coreShift: 4.5,
    cta: { kind: "external", label: "Launch Forge Studio", href: "https://web3forge.3301studios.com/" },
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
    cta: { kind: "external", label: "Enter life.exe", href: "https://life.3301studios.com/" },
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
    cta: { kind: "external", label: "Play Bonkler Battle", href: "https://bonkler.3301studios.com/" },
  },
  {
    id: "dia",
    ring: "C",
    category: "Sites",
    name: "Dead Internet Archive",
    glyph: "骸",
    color: "#6BFF8E",
    thesis: "Artifacts recovered from a broken internet.",
    description:
      "A clothing archive and demo storefront for nine original graphic garments. Browse the collection, inspect individual pieces, and keep selections in a persistent local cart. Checkout stays offline while the archive preserves the artwork and product details.",
    stack: ["HTML", "CSS", "JavaScript", "WebP", "Vercel"],
    role: "Concept, art direction, design, full build",
    status: "LIVE DEMO",
    statusNote: "live demo storefront · payments offline",
    uptime: "1MO",
    coreShift: 6.2,
    cta: { kind: "external", label: "Enter Demo Store", href: "https://dia.3301studios.com/" },
  },
  {
    id: "emp",
    ring: "C",
    category: "Sites",
    name: "EMP",
    glyph: "戯",
    color: "#E8173F",
    thesis: "Every coding agent on your Mac, in one window.",
    description:
      "EMP is a Mac workspace for coding agents such as Claude Code, Codex, Hermes and pi. Run real agent sessions through chat, take over their terminals, and keep tasks running after the window closes. Suki coordinates work across agents, while scheduled prompts and a shared session history keep ongoing projects in one place.",
    stack: ["JavaScript", "Three.js", "GLSL", "GSAP", "Vite"],
    role: "Art direction, interaction design, full build",
    status: "LIVE",
    statusNote: "live website · macOS app download",
    uptime: "11D",
    coreShift: 6.2,
    cta: { kind: "external", label: "Visit EMP", href: "https://emp.orionterminal.app/" },
  },
  {
    id: "archives",
    ring: "C",
    category: "Sites",
    name: "Archives 47",
    glyph: "蔵",
    color: "#27FF87",
    thesis: "Notes, journal, mood boards and media, in one archive you can ask.",
    description:
      "Archives 47 is a personal knowledge app for Mac that keeps notes, journals, mood boards, media and databases in one local library. Link pages with wikilinks and backlinks, organize collections, and search by text or meaning. Ask Archive answers questions from your own notes, while Brain maps connections between linked and related ideas.",
    stack: ["JavaScript", "Three.js", "GLSL", "Fluid simulation", "GSAP", "Vite"],
    role: "Art direction, interaction design, full build",
    status: "LIVE",
    statusNote: "live website · macOS app download",
    uptime: "3D",
    coreShift: 6.2,
    cta: { kind: "external", label: "Visit Archives 47", href: "https://archives.orionterminal.app/" },
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
  A: { id: "A", label: "APPS", radius: 3.1, projects: ["orion"] },
  B: { id: "B", label: "TOOLS", radius: 4.35, projects: ["joust", "widow", "forge"] },
  C: { id: "C", label: "SITES", radius: 5.6, projects: ["finders", "life", "bonkler", "dia", "emp", "archives"] },
};

// Root-terminal contact block (brief §2.6). Placeholders flagged for the operator.
export const CONTACT = {
  x: { label: "x", href: "https://x.com/chakra3301", value: "@chakra3301" },
  linkedin: { label: "linkedin", href: "https://www.linkedin.com/in/lucaorion", value: "in/lucaorion" },
  email: { label: "email", href: "mailto:hello@nokiademon.dev", value: "hello@nokiademon.dev" },
};

// notes.txt — operator writes this directly (brief §7). Honest placeholder.
export const NOTES =
  "ten processes, one operator. building instruments that think.\nmost of this runs in private beta. knock if you want in.";
