import React, { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useRealtime } from '../context/RealtimeContext'
import styles from './Layout.module.css'

const NAV_ITEMS = [
  { to: '/dashboard',       icon: '⬛', label: 'Dashboard' },
  { to: '/alerts',          icon: '🔔', label: 'Alertas', badge: true },
  { to: '/locked-accounts', icon: '🔒', label: 'Contas Bloqueadas' },
  { to: '/ip-investigation',icon: '🔍', label: 'Investigar IP' },
  { to: '/measurements',    icon: '📊', label: 'Medições / Exportação' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [showSimulateMenu, setShowSimulateMenu] = useState(false)

  const {
    counts,
    connectionStatus,
    lastSync,
    isPaused,
    actionLoading,
    newAlertToast,
    togglePause,
    refreshNow,
    simulateAttack,
    dismissToast,
  } = useRealtime()

  async function handleSimulate(type) {
    setShowSimulateMenu(false)
    await simulateAttack(type)
  }

  // Define texto e classe do status
  let statusText = 'Ao Vivo (MySQL)'
  let statusClass = styles.statusLive
  if (connectionStatus === 'paused') {
    statusText = 'Pausado'
    statusClass = styles.statusPaused
  } else if (connectionStatus === 'polling') {
    statusText = 'Polling Ativo'
    statusClass = styles.statusPolling
  } else if (connectionStatus === 'mock') {
    statusText = 'Modo Mock'
    statusClass = styles.statusMock
  }

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>🛡️</span>
          {!collapsed && (
            <span className={styles.brandText}>
              SQL Leak<br />
              <small>Detection Real-Time</small>
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
              {!collapsed && item.badge && counts.total > 0 && (
                <span className={styles.navBadge}>{counts.total}</span>
              )}
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

          <div className={styles.topbarMeta}>
            {/* Live Indicator Pill */}
            <span className={`${styles.statusPill} ${statusClass}`}>
              <span className={styles.dot} />
              {statusText}
            </span>

            {/* Last update time */}
            <span className={styles.time} title="Última sincronização com o backend">
              {lastSync ? lastSync.toLocaleTimeString('pt-BR') : '--:--:--'}
            </span>

            {/* Control buttons */}
            <div className={styles.topbarActions}>
              <button
                className={styles.btnControl}
                onClick={togglePause}
                title={isPaused ? 'Retomar atualizações em tempo real' : 'Pausar stream em tempo real'}
              >
                {isPaused ? '▶️ Retomar' : '⏸️ Pausar'}
              </button>

              <button
                className={styles.btnControl}
                onClick={refreshNow}
                disabled={actionLoading}
                title="Forçar sincronização com o banco agora"
              >
                🔄 {actionLoading ? 'Sincronizando…' : 'Atualizar'}
              </button>

              {/* Simular Ataque Trigger */}
              <div className={styles.simulateWrap}>
                <button
                  className={styles.btnSimulate}
                  onClick={() => setShowSimulateMenu((v) => !v)}
                  disabled={actionLoading}
                  title="Injeta ataques reais no MySQL para demonstrar a detecção ao vivo"
                >
                  ⚡ Simular Ataque ▾
                </button>

                {showSimulateMenu && (
                  <div className={styles.dropdownMenu}>
                    <div className={styles.dropdownTitle}>Injetar ataque no MySQL</div>
                    <button className={styles.dropdownItem} onClick={() => handleSimulate('brute_force')}>
                      💥 Força Bruta / Password Spray
                    </button>
                    <button className={styles.dropdownItem} onClick={() => handleSimulate('lateral_movement')}>
                      🔄 Movimentação Lateral (5 IPs)
                    </button>
                    <button className={styles.dropdownItem} onClick={() => handleSimulate('data_export')}>
                      📦 Exportação Massiva (65 medições)
                    </button>
                    <button className={styles.dropdownItem} onClick={() => handleSimulate('sql_injection')}>
                      💉 SQL Injection (Payloads)
                    </button>
                    <button className={styles.dropdownItem} onClick={() => handleSimulate('lockout')}>
                      🔒 Lockout de Conta (60 min)
                    </button>
                    <button className={styles.dropdownItem} onClick={() => handleSimulate('token_enum')}>
                      🔑 Enumeração de Tokens (10x)
                    </button>
                    <div className={styles.dropdownDivider} />
                    <button className={styles.dropdownItem} style={{ color: '#ec4899', fontWeight: 600 }} onClick={() => handleSimulate('all')}>
                      🚀 Simular Todos os Ataques
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>

      {/* Floating toast notification for live attacks */}
      {newAlertToast && (
        <div className={styles.toastAlert}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <strong>Novo alerta detectado em tempo real!</strong>
            <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.9 }}>
              [{newAlertToast.severity}] {newAlertToast.typeLabel}: {newAlertToast.target}
            </p>
          </div>
          <button className={styles.toastClose} onClick={dismissToast}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function PageTitle() {
  const location = useLocation()
  const map = {
    '/dashboard':        'Visão Geral do Monitoramento',
    '/alerts':           'Tabela de Alertas',
    '/locked-accounts':  'Contas Bloqueadas',
    '/ip-investigation': 'Investigação de IP',
    '/measurements':     'Medições por Loja',
  }
  return map[location.pathname] ?? 'Dashboard'
}
