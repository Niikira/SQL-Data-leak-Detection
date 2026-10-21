import React from 'react'

// Conjunto de ícones em SVG (traço, 24x24). Substitui os emojis da interface
// sem adicionar dependências ao projeto.
const PATHS = {
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>),
  bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  crosshair: (<><circle cx="12" cy="12" r="9" /><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  bars: (<><path d="M3 3v18h18" /><path d="M8 17v-4M13 17V8M18 17v-7" /></>),
  chevronLeft: (<path d="m15 18-6-6 6-6" />),
  chevronRight: (<path d="m9 18 6-6-6-6" />),
  zap: (<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />),
  rotate: (<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>),
  refresh: (<><path d="M21 12a9 9 0 0 0-15.7-6L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 15.7 6l2.3-2" /><path d="M16 16h5v5" /></>),
  eraser: (<><path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></>),
  crown: (<><path d="m3 17-1-10 5 4 5-7 5 7 5-4-1 10z" /><path d="M5 21h14" /></>),
  briefcase: (<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>),
  globe: (<><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>),
  clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  x: (<path d="M18 6 6 18M6 6l12 12" />),
  xCircle: (<><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>),
  check: (<path d="M20 6 9 17l-5-5" />),
  checkCircle: (<><circle cx="12" cy="12" r="10" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>),
  alert: (<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  info: (<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>),
  key: (<><circle cx="7.5" cy="15.5" r="4.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>),
  code: (<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />),
  shuffle: (<><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="m4 4 5 5" /></>),
  target: (<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
  wind: (<><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>),
  moon: (<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />),
  trendUp: (<><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>),
  hash: (<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />),
  timer: (<><path d="M10 2h4" /><path d="m12 14 3-3" /><circle cx="12" cy="14" r="8" /></>),
  store: (<><path d="m3 9 1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9h18" /><path d="M9 20v-6h6v6" /></>),
  message: (<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  database: (<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" /><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3" /></>),
  activity: (<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  arrowUpDown: (<><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></>),
  arrowUp: (<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>),
  arrowDown: (<><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>),
  loader: (<path d="M21 12a9 9 0 1 1-6.2-8.6" />),
  terminal: (<><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></>),
}

export default function Icon({ name, size = 16, strokeWidth = 1.75, className, style, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {PATHS[name] || PATHS.info}
    </svg>
  )
}
