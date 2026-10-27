// Minimal stroke icon set (lucide-style), no dependency.
const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const Icon = {
  Bot: (p) => (
    <svg {...base} {...p}><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 8V4M9 4h6" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /><path d="M2 13v2M22 13v2" /></svg>
  ),
  Pen: (p) => (
    <svg {...base} {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
  ),
  Target: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>
  ),
  Users: (p) => (
    <svg {...base} {...p}><path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="3" /><path d="M22 19v-1a4 4 0 0 0-3-3.87" /><path d="M16 4.13A4 4 0 0 1 16 11.5" /></svg>
  ),
  Bell: (p) => (
    <svg {...base} {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.5 21a1.7 1.7 0 0 1-3 0" /></svg>
  ),
  Shield: (p) => (
    <svg {...base} {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  Calendar: (p) => (
    <svg {...base} {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
  ),
  Chart: (p) => (
    <svg {...base} {...p}><path d="M3 3v18h18" /><path d="m7 14 3-3 3 3 5-6" /></svg>
  ),
  Gauge: (p) => (
    <svg {...base} {...p}><path d="M12 14 8 9" /><path d="M3.5 16a9 9 0 1 1 17 0" /><circle cx="12" cy="14" r="1.5" /></svg>
  ),
  Lock: (p) => (
    <svg {...base} {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  ),
  Bolt: (p) => (
    <svg {...base} {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
  ),
  Check: (p) => (
    <svg {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>
  ),
  X: (p) => (
    <svg {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  Arrow: (p) => (
    <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  ),
  Expand: (p) => (
    <svg {...base} {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
  ),
  Apple: (p) => (
    <svg {...p} width={p.width || 20} height={p.height || 20} viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.15-2.53.99-1.45 1.4-2.85 1.42-2.93-.03-.01-2.72-1.04-2.75-4.13zM14.5 4.6c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.08 3.17 1.15.09 2.33-.58 3.03-1.44z"/></svg>
  ),
  Windows: (p) => (
    <svg {...p} width={p.width || 20} height={p.height || 20} viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5 10.5 4.4v7.1H3V5.5zm0 13L10.5 19.6v-7H3v6zM11.5 4.2 21 3v8.5h-9.5V4.2zm0 8.3H21V21l-9.5-1.3v-7.2z"/></svg>
  ),
  Linux: (p) => (
    <svg {...p} width={p.width || 20} height={p.height || 20} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-2 0-3 1.8-3 4 0 1.3.2 2 .2 3.2 0 1-1 1.8-1.8 3.4-.8 1.5-2 3.2-2 5 0 1.6.8 2.2 1.7 2.5.4 1 1.3 1.9 4.9 1.9s4.5-.9 4.9-1.9c.9-.3 1.7-.9 1.7-2.5 0-1.8-1.2-3.5-2-5-.8-1.6-1.8-2.4-1.8-3.4 0-1.2.2-1.9.2-3.2 0-2.2-1-4-3-4zm-1.4 5.2c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9zm2.8 0c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9zM12 10c.9 0 2 .6 2 1.1 0 .3-.5.5-1 .7-.4.2-.7.5-1 .5s-.6-.3-1-.5c-.5-.2-1-.4-1-.7 0-.5 1.1-1.1 2-1.1z"/></svg>
  ),
}
