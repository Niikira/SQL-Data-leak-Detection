import React from 'react'

export default function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <div className="page-meta">{children}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

// Indica se a página está recebendo dados da API.
export function StatusPill({ online, loading }) {
  if (online == null || (loading && online == null)) {
    return <span className="pill pill-idle"><span className="pill-dot" />conectando</span>
  }
  if (online === false) {
    return <span className="pill pill-off"><span className="pill-dot" />API offline</span>
  }
  return <span className="pill pill-live"><span className="pill-dot" />dados ao vivo</span>
}
