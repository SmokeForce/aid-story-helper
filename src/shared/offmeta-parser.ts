export interface OffMetaItem {
  id: string;
  type: "bullet" | "block";
  content: string; // The raw instruction text to be applied
  title?: string;  // Title of the block (if type is "block")
}

export interface OffMetaGroup {
  name: string; // Optional sub-header/group name within a section
  items: OffMetaItem[];
}

export interface OffMetaSection {
  title: string;
  groups: OffMetaGroup[];
}

const SECTIONS_MAP: Record<string, string> = {
  "Premade AIN": "🤖 Premade AIN",
  "AN/PE": "🤖 AN/PE",
  "POV & Tense": "📹 POV & Tense",
  "Writing Direction": "📝 Writing Direction",
  "Description Weeding": "🌱 Description Weeding",
  "Pacing": "⏱️ Pacing",
  "Coherence": "🫠 Coherence",
  "Removing Repetition": "🔁 Removing Repetition",
  "Push Lines": "🫸 Push Lines",
  "Characterization": "😃 Characterization",
  "Arguing Problem": "😡 Arguing Problem",
  "Romance": "🥰 Romance",
  "Character Controls": "🎮 Character Controls",
  "Combat & Difficulty": "⚔️ Combat & Difficulty",
  "Name Fixing": "🤬 Name Fixing",
  "Fantasy": "🏰 Fantasy",
  "Scifi": "🤖 Scifi",
  "Miscellaneous": "🤷 Miscellaneous"
};

const IGNORED_SECTIONS = [
  "Suggested Settings",
  "Trope Killer Dictionary",
  "Commands/SSCs",
  "Introduction"
];

function isAinSubheading(trimmed: string): boolean {
  if (!trimmed || trimmed.length > 80) return false;
  if (trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("#") || trimmed.startsWith("ROLE:")) return false;
  const lower = trimmed.toLowerCase();
  return lower.includes("ain") || lower.includes("instruction") || lower.includes("zoocata") || lower.includes("raven");
}

export function parseOffMetaText(text: string): OffMetaSection[] {
  const sections: OffMetaSection[] = [];
  const lines = text.split(/\r?\n/);

  let currentSection: OffMetaSection | null = null;
  let currentGroup: OffMetaGroup | null = null;

  // Block accumulation
  let inBlock = false;
  let isBracketedBlock = false;
  let blockTitle = "";
  let blockLines: string[] = [];

  const closeBlock = () => {
    if (inBlock && blockLines.length > 0 && currentSection && currentGroup) {
      const content = blockLines.join("\n").trim();
      if (content) {
        const isDescription = 
          currentSection.title === "🤖 AN/PE" && 
          (content.includes("suggest keeping it simple") || 
           content.includes("should usually only contain raw information"));
        if (!isDescription) {
          currentGroup.items.push({
            id: Math.random().toString(36).substring(2, 9),
            type: "block",
            title: blockTitle || "Block Item",
            content
          });
        }
      }
    }
    inBlock = false;
    isBracketedBlock = false;
    blockTitle = "";
    blockLines = [];
  };

  const closeGroup = () => {
    closeBlock();
    if (currentGroup && currentGroup.items.length > 0 && currentSection) {
      currentSection.groups.push(currentGroup);
    }
    currentGroup = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // 1. Identify Section Header
    let matchedSectionKey = "";
    for (const key of Object.keys(SECTIONS_MAP)) {
      if (trimmed.includes(key)) {
        matchedSectionKey = key;
        break;
      }
    }

    let isIgnored = false;
    for (const key of IGNORED_SECTIONS) {
      if (trimmed.includes(key)) {
        isIgnored = true;
        break;
      }
    }

    if (matchedSectionKey || isIgnored) {
      closeGroup();
      if (currentSection && currentSection.groups.length > 0) {
        sections.push(currentSection);
      }
      currentSection = null;

      if (matchedSectionKey) {
        currentSection = {
          title: SECTIONS_MAP[matchedSectionKey]!,
          groups: []
        };
        currentGroup = { name: "", items: [] };
      }
      continue;
    }

    // If we're not inside a valid section, skip lines
    if (!currentSection) continue;

    // 2. Parse lines based on current section
    if (currentSection.title === "🤖 Premade AIN") {
      if (!trimmed) continue;
      
      if (isAinSubheading(trimmed)) {
        closeBlock();
        inBlock = true;
        blockTitle = trimmed;
      } else {
        if (inBlock) {
          blockLines.push(line);
        }
      }
    } else if (currentSection.title === "🤖 AN/PE") {
      const isHeading = (t: string) => {
        const norm = t.toLowerCase().replace(/['’]/g, "");
        return norm === "authors note" || 
               norm === "authors note:" || 
               norm === "basic authors note" || 
               norm === "basic authors note:" || 
               norm === "plot essentials" || 
               norm === "plot essentials:";
      };

      if (!trimmed || trimmed.startsWith("^") || trimmed.startsWith("—Or—") || trimmed.startsWith("---")) {
        closeBlock();
      } else if (inBlock) {
        if (isHeading(trimmed) || (trimmed.startsWith("[") && !isBracketedBlock)) {
          closeBlock();
          inBlock = true;
          isBracketedBlock = trimmed.startsWith("[") || trimmed.startsWith("{");
          if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
            blockTitle = trimmed;
            blockLines.push(line);
            if (trimmed.endsWith("]") || trimmed.endsWith("}")) {
              closeBlock();
            }
          } else if (trimmed.endsWith(":")) {
            blockTitle = trimmed;
          } else {
            blockTitle = trimmed;
            blockLines.push(line);
          }
        } else {
          blockLines.push(line);
          if (isBracketedBlock && (trimmed.endsWith("]") || trimmed.endsWith("}"))) {
            closeBlock();
          }
        }
      } else if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        const bulletText = trimmed.replace(/^[-*]\s*/, "");
        if (bulletText) {
          currentGroup!.items.push({
            id: Math.random().toString(36).substring(2, 9),
            type: "bullet",
            content: bulletText
          });
        }
      } else {
        inBlock = true;
        isBracketedBlock = trimmed.startsWith("[") || trimmed.startsWith("{");
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          blockTitle = trimmed;
          blockLines.push(line);
          if (trimmed.endsWith("]") || trimmed.endsWith("}")) {
            closeBlock();
          }
        } else if (trimmed.endsWith(":")) {
          blockTitle = trimmed;
        } else {
          blockTitle = trimmed;
          blockLines.push(line);
        }
      }
    } else {
      // General AIN categories
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        closeBlock();
        const bulletText = trimmed.replace(/^[-*]\s*/, "");
        if (bulletText) {
          currentGroup!.items.push({
            id: Math.random().toString(36).substring(2, 9),
            type: "bullet",
            content: bulletText
          });
        }
      } else if (trimmed && !trimmed.startsWith("^")) {
        // Group sub-header line, e.g. "Slow Down:" or "[Kooling Katie: Gentle AIN]"
        closeGroup();
        currentGroup = { name: trimmed, items: [] };
      }
    }
  }

  // Close final group and section
  closeGroup();
  if (currentSection && currentSection.groups.length > 0) {
    sections.push(currentSection);
  }

  return sections.filter(s => s.groups.some(g => g.items.length > 0));
}
