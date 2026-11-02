// Port of js/templates.js
export const TEMPLATES = [
  { id: "classic", name: "Classic" },
  { id: "modern", name: "Modern" },
  { id: "minimal", name: "Minimal" },
  { id: "professional", name: "Professional" },
  { id: "elegant", name: "Elegant" },
  { id: "compact", name: "Compact" },
  { id: "bold", name: "Bold" },
  { id: "corporate", name: "Corporate" },
  { id: "simple", name: "Simple" },
  { id: "clean", name: "Clean" },
  { id: "retail", name: "Retail" },
  { id: "service", name: "Service" },
  { id: "premium", name: "Premium" },
  { id: "modern-business", name: "Modern Business" },
];

export function templateLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
