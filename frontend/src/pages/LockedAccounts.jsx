import React, { useState, useEffect } from 'react'
import Icon from '../components/Icon'
import PageHeader, { StatusPill } from '../components/PageHeader'
import { getJson } from '../lib/api'
import styles from './LockedAccounts.module.css'

function getRemainingMs(iso) {
  return Math.max(0, new Date(iso) - Date.now())
}

function useRemaining(lockedUntil) {
  const [remaining, setRemaining] = useState(getRemainingMs(lockedUntil))
  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemainingMs(lockedUntil)), 1000)
    return () => clearInterval(id)
  }, [lockedUntil])
  return remaining
}

function fmtMs(ms) {
  if (ms <= 0) return 'liberada'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h > 0 ? `${h}:${mmss}` : mmss
}

function fmtLock(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const ROLES = {
  admin:   { label: 'Administrador', icon: 'crown' },
  manager: { label: 'Gerente',       icon: 'briefcase' },
}
function roleMeta(role) {
  return ROLES[role] || { label: 'Usuário', icon: 'user' }
}

function initials(name) {
  const parts = String(name).split(/[_\s.-]+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase()
}

function Countdown({ lockedUntil }) {
  const ms = useRemaining(lockedUntil)
  const urgent = ms > 0 && ms < 5 * 60 * 1000
  return (
    <span className={`${styles.countdown} ${urgent ? styles.urgent : ''} ${ms === 0 ? styles.expired : ''}`}>
      {fmtMs(ms)}
    </span>
  )
}

function LockProgress({ lockedUntil }) {
  // Sem a duração original no banco, usa como referência o maior entre o
  // restante visto ao abrir a tela e 15 min (o lockout do pentest).
  const [total] = useState(() => Math.max(getRemainingMs(lockedUntil), 15 * 60 * 1000))
  const remaining = useRemaining(lockedUntil)
  const pct = Math.min(100, Math.round(((total - remaining) / total) * 100))
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
      <span className={styles.progressLabel}>{pct}% do bloqueio cumprido</span>
    </div>
  )
}

export default function LockedAccounts() {
  const [accounts, setAccounts] = useState([])
  const [online, setOnline]     = useState(null)

  useEffect(() => {
    let cancelado = false
    const carregar = () =>
      getJson('/api/locked-accounts')
        .then((d) => { if (!cancelado) { setAccounts(Array.isArray(d) ? d : []); setOnline(true) } })
        .catch(() => { if (!cancelado) setOnline(false) })
    carregar()
    const timer = setInterval(carregar, 5000)
    return () => { cancelado = true; clearInterval(timer) }
  }, [])

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="03 — Contenção" title="Contas bloqueadas">
        <StatusPill online={online} />
        <span>{accounts.length} conta{accounts.length !== 1 ? 's' : ''} em lockout · contagem em tempo real</span>
      </PageHeader>

      {accounts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-icon"><Icon name="lock" size={18} /></span>
            <strong>Nenhuma conta bloqueada</strong>
            Rode o pentest na aba Alertas para provocar um lockout por força bruta.
          </div>
        </div>
      ) : (
        <>
          <div className={styles.cardGrid}>
            {accounts.map((user) => {
              const role = roleMeta(user.role)
              return (
                <article key={user.id} className={`card ${styles.userCard}`}>
                  <header className={styles.userHead}>
                    <span className={styles.avatar}>{initials(user.username)}</span>
                    <div className={styles.userInfo}>
                      <span className={styles.userName}>{user.username}</span>
                      <span className={styles.userRole}><Icon name={role.icon} size={12} />{role.label}</span>
                    </div>
                    <span className="badge badge-ALTA">Bloqueada</span>
                  </header>

                  <div className={styles.countdownBox}>
                    <span className={styles.countLabel}>Desbloqueio em</span>
                    <Countdown lockedUntil={user.lockedUntil} />
                  </div>
                  <LockProgress lockedUntil={user.lockedUntil} />

                  <dl className={styles.facts}>
                    <div>
                      <dt><Icon name="xCircle" size={14} />Tentativas falhas</dt>
                      <dd className={styles.failCount}>{user.failedAttempts}</dd>
                    </div>
                    <div>
                      <dt><Icon name="globe" size={14} />Último IP suspeito</dt>
                      <dd className="td-mono">{user.lastFailedIp}</dd>
                    </div>
                    <div>
                      <dt><Icon name="clock" size={14} />Bloqueada até</dt>
                      <dd className="td-mono">{fmtLock(user.lockedUntil)}</dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>

          <div className="card card-flush">
            <div className={styles.tableHead}><div className="card-title">Resumo de lockouts</div></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Perfil</th>
                    <th>Falhas</th>
                    <th>Último IP</th>
                    <th>Bloqueada até</th>
                    <th>Restante</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((user) => {
                    const role = roleMeta(user.role)
                    return (
                      <tr key={user.id}>
                        <td className="td-mono">{user.username}</td>
                        <td className="td-muted">
                          <span className={styles.roleCell}><Icon name={role.icon} size={13} />{role.label}</span>
                        </td>
                        <td className={`td-mono ${styles.failCount}`}>{user.failedAttempts}</td>
                        <td className="td-mono">{user.lastFailedIp}</td>
                        <td className="td-mono td-muted">{fmtLock(user.lockedUntil)}</td>
                        <td><Countdown lockedUntil={user.lockedUntil} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
