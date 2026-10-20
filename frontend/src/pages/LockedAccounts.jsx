import React, { useState, useEffect } from 'react'
import styles from './LockedAccounts.module.css'

function useCountdown(lockedUntil) {
  const [remaining, setRemaining] = useState(getRemainingMs(lockedUntil))

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemainingMs(lockedUntil)), 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  return remaining
}

function getRemainingMs(iso) {
  return Math.max(0, new Date(iso) - Date.now())
}

function fmtMs(ms) {
  if (ms <= 0) return 'Expirado'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const parts = []
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${String(m).padStart(2, '0')}m`)
  parts.push(`${String(s).padStart(2, '0')}s`)
  return parts.join(' ')
}

function CountdownCell({ lockedUntil }) {
  const ms = useCountdown(lockedUntil)
  const urgent = ms < 10 * 60 * 1000 && ms > 0  // < 10 min
  return (
    <span className={`${styles.countdown} ${urgent ? styles.urgent : ''} ${ms === 0 ? styles.expired : ''}`}>
      {fmtMs(ms)}
    </span>
  )
}

function roleIcon(role) {
  if (role === 'admin')   return '👑'
  if (role === 'manager') return '🏢'
  return '👤'
}

export default function LockedAccounts() {
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    let cancelado = false
    const carregar = () =>
      fetch('/api/locked-accounts')
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (!cancelado) setAccounts(Array.isArray(d) ? d : []) })
        .catch(() => { if (!cancelado) setAccounts([]) })
    carregar()
    const timer = setInterval(carregar, 5000)
    return () => { cancelado = true; clearInterval(timer) }
  }, [])

  return (
    <div className={styles.page}>
      <div className="page-header">
        <h1>Contas Bloqueadas</h1>
        <p>
          {accounts.length} conta{accounts.length !== 1 ? 's' : ''} em lockout
          — contagem regressiva em tempo real
        </p>
      </div>

      {accounts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
          Nenhuma conta bloqueada no momento. Rode o pentest na aba “Alertas” para gerar um lockout.
        </div>
      )}

      <div className={styles.cardGrid}>
        {accounts.map((user) => (
          <div key={user.id} className={`card ${styles.userCard}`}>
            <div className={styles.userHeader}>
              <span className={styles.userIcon}>{roleIcon(user.role)}</span>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.username}</span>
                <span className={styles.userRole}>{user.role}</span>
              </div>
              <span className={`badge badge-ALTA`} style={{ marginLeft: 'auto' }}>Bloqueado</span>
            </div>

            <div className={styles.userStats}>
              <StatRow icon="❌" label="Tentativas falhas" value={user.failedAttempts} />
              <StatRow icon="🌐" label="Último IP suspeito" value={user.lastFailedIp} mono />
              <StatRow
                icon="🕒"
                label="Bloqueado até"
                value={new Date(user.lockedUntil).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })}
              />
            </div>

            <div className={styles.countdownWrap}>
              <span className={styles.countdownLabel}>Tempo restante</span>
              <CountdownCell lockedUntil={user.lockedUntil} />
            </div>

            {/* Progress bar */}
            <LockProgress lockedUntil={user.lockedUntil} />
          </div>
        ))}
      </div>

      {/* Summary table */}
      <div className={`card ${styles.tableCard}`}>
        <h2 className={styles.tableTitle}>Resumo de lockouts</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Role</th>
                <th>Tentativas falhas</th>
                <th>Último IP</th>
                <th>Bloqueado até</th>
                <th>Restante</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    Nenhuma conta bloqueada.
                  </td>
                </tr>
              ) : accounts.map((user) => (
                <tr key={user.id}>
                  <td className="td-mono">{user.username}</td>
                  <td className="td-muted">{roleIcon(user.role)} {user.role}</td>
                  <td style={{ color: 'var(--sev-high)', fontWeight: 700 }}>{user.failedAttempts}</td>
                  <td className="td-mono">{user.lastFailedIp}</td>
                  <td className="td-muted">
                    {new Date(user.lockedUntil).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td><CountdownCell lockedUntil={user.lockedUntil} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatRow({ icon, label, value, mono }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statIcon}>{icon}</span>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${mono ? 'td-mono' : ''}`}>{value}</span>
    </div>
  )
}

function LockProgress({ lockedUntil }) {
  // Assume lockouts last 120 min from now — show how much has elapsed
  const total = 120 * 60 * 1000
  const [remaining, setRemaining] = useState(getRemainingMs(lockedUntil))

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemainingMs(lockedUntil)), 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  const pct = Math.round(((total - remaining) / total) * 100)
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={styles.progressLabel}>{Math.min(pct, 100)}% do período de bloqueio decorrido</span>
    </div>
  )
}
