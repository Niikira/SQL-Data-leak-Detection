import React, { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import styles from './Layout.module.css'

const NAV_ITEMS = [
  { to: '/dashboard',       icon: '⬛', label: 'Dashboard' },
  { to: '/alerts',          icon: '🔔', label: 'Alertas' },
  { to: '/locked-accounts', icon: '🔒', label: 'Contas Bloqueadas' },
  { to: '/ip-investigation',icon: '🔍', label: 'Investigar IP' },
  { to: '/measurements',    icon: '📊', label: 'Medições / Exportação' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>🛡️</span>
          {!collapsed && (
            <span className={styles.brandText}>
              SQL Leak<br />
              <small>Detection</small>
            </span>
          )}
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <span className={styles.topbarTitle}>
            <PageTitle />
          </span>
          <span className={styles.topbarMeta}>
            <span className={styles.dot} />
            Sistema ativo — dados mockados
            <span className={styles.time}>{new Date().toLocaleTimeString('pt-BR')}</span>
          </span>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function PageTitle() {
  const location = useLocation()
  const map = {
    '/dashboard':        'Visão Geral',
    '/alerts':           'Tabela de Alertas',
    '/locked-accounts':  'Contas Bloqueadas',
    '/ip-investigation': 'Investigação de IP',
    '/measurements':     'Medições por Loja',
  }
  return map[location.pathname] ?? 'Dashboard'
}
