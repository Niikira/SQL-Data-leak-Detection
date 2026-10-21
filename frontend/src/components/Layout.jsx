import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Icon from './Icon'
import styles from './Layout.module.css'

const NAV_ITEMS = [
  { to: '/dashboard',        icon: 'grid',      label: 'Visão geral' },
  { to: '/alerts',           icon: 'bell',      label: 'Alertas' },
  { to: '/locked-accounts',  icon: 'lock',      label: 'Contas bloqueadas' },
  { to: '/ip-investigation', icon: 'crosshair', label: 'Investigar IP' },
  { to: '/measurements',     icon: 'bars',      label: 'Medições' },
]

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const now = useClock()
  const location = useLocation()
  const current = NAV_ITEMS.find((i) => location.pathname.startsWith(i.to))

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
      {/* ── Barra lateral ──────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <BrandMark />
          {!collapsed && (
            <div className={styles.brandText}>
              <span className={styles.brandName}>sql<span>/</span>leak</span>
              <span className={styles.brandSub}>detection · soc</span>
            </div>
          )}
        </div>

        {!collapsed && <div className={styles.navCaption}>Monitoramento</div>}

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon name={item.icon} size={17} className={styles.navIcon} />
              {!collapsed && (
                <>
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navIndex}>{String(i + 1).padStart(2, '0')}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {!collapsed && (
          <div className={styles.sideFooter}>
            <div className={styles.sideFooterRow}>
              <Icon name="database" size={14} />
              <span>MySQL · auditoria</span>
            </div>
            <p className={styles.sideFooterHint}>
              7 regras de detecção varrendo os logs em janelas de 30 min a 24 h.
            </p>
          </div>
        )}

        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          {!collapsed && <span>Recolher</span>}
        </button>
      </aside>

      {/* ── Área principal ─────────────────────────────────────────────── */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.crumbs}>
            <span className={styles.crumbRoot}>SOC</span>
            <Icon name="chevronRight" size={14} className={styles.crumbSep} />
            <span className={styles.crumbCurrent}>{current ? current.label : 'Visão geral'}</span>
          </div>
          <div className={styles.topbarMeta}>
            <span className={styles.live}>
              <span className={styles.liveDot} />
              Monitorando
            </span>
            <span className={styles.clock}>{now.toLocaleTimeString('pt-BR')}</span>
          </div>
        </header>

        <main className={styles.content}>
          <div className={styles.contentInner}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

// Marca: um banco de dados com uma gota "vazando".
function BrandMark() {
  return (
    <svg className={styles.brandMark} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent-dim)" stroke="var(--accent)" strokeOpacity=".45" />
      <ellipse cx="15" cy="10" rx="7" ry="2.6" fill="none" stroke="var(--accent)" strokeWidth="1.7" />
      <path d="M8 10v11c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V10" fill="none" stroke="var(--accent)" strokeWidth="1.7" />
      <path d="M8 15.5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeOpacity=".45" />
      <path d="M24.5 18.5s-3 3.2-3 5a3 3 0 0 0 6 0c0-1.8-3-5-3-5z" fill="var(--sev-high)" />
    </svg>
  )
}
