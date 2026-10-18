import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { useRealtime } from '../context/RealtimeContext'
import styles from './Dashboard.module.css'

const ALERT_TYPES = [
  { key: 'LATERAL_MOVEMENT', label: 'Movimentação Lateral' },
  { key: 'BRUTE_FORCE',      label: 'Força Bruta' },
  { key: 'PASSWORD_SPRAY',   label: 'Password Spray' },
  { key: 'TOKEN_ENUM',       label: 'Enumeração de Tokens' },
  { key: 'ACCOUNT_LOCKOUT',  label: 'Bloqueio de Conta' },
  { key: 'DATA_EXPORT',      label: 'Exportação Massiva' },
  { key: 'WEAK_HASH',        label: 'Hash Fraco / TOTP' },
  { key: 'SHORT_TOTP',       label: 'TOTP Curto' },
  { key: 'SQL_INJECTION',    label: 'SQL Injection' },
  { key: 'OFF_HOURS',        label: 'Acesso Fora de Horário' },
  { key: 'PRIV_ESCALATION',  label: 'Escalação de Privilégio' },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { counts, typeCounts, recentAlerts, alertsOverTime, connectionStatus } = useRealtime()

  return (
    <div className={styles.page}>
      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className={styles.summaryGrid}>
        <SummaryCard
          label="Total de Alertas"
          value={counts.total}
          sub="últimas 24h"
          color="var(--text-primary)"
          bg="var(--bg-elevated)"
          icon="🔔"
        />
        <SummaryCard
          label="Severidade ALTA"
          value={counts.ALTA}
          sub="requerem ação imediata"
          color="var(--sev-high)"
          bg="var(--sev-high-bg)"
          icon="🔴"
        />
        <SummaryCard
          label="Severidade MÉDIA"
          value={counts.MÉDIA}
          sub="monitorar de perto"
          color="var(--sev-med)"
          bg="var(--sev-med-bg)"
          icon="🟡"
        />
        <SummaryCard
          label="Severidade BAIXA"
          value={counts.BAIXA}
          sub="registradas para auditoria"
          color="var(--sev-low)"
          bg="var(--sev-low-bg)"
          icon="🔵"
        />
      </div>

      {/* ── Chart row ─────────────────────────────────────────────────── */}
      <div className={styles.chartRow}>
        {/* Area chart — alertas ao longo do tempo */}
        <div className={`card ${styles.chartCard}`}>
          <h2 className={styles.cardTitle}>Alertas ao longo do tempo (hoje)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={alertsOverTime} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAlta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--chart-high)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-high)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradMedia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--chart-med)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-med)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBaixa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--chart-low)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-low)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
              <Area type="monotone" dataKey="ALTA"  stroke="var(--chart-high)" fill="url(#gradAlta)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="MÉDIA" stroke="var(--chart-med)"  fill="url(#gradMedia)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="BAIXA" stroke="var(--chart-low)"  fill="url(#gradBaixa)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Alert type breakdown */}
        <div className={`card ${styles.typeCard}`}>
          <h2 className={styles.cardTitle}>Por tipo de alerta</h2>
          <div className={styles.typeList}>
            {ALERT_TYPES.map((t) => {
              const count = typeCounts[t.key] || 0
              if (count === 0) return null
              const max = Math.max(...Object.values(typeCounts))
              const pct = Math.round((count / max) * 100)
              return (
                <div key={t.key} className={styles.typeRow}>
                  <span className={styles.typeLabel}>{t.label}</span>
                  <div className={styles.typeBar}>
                    <div className={styles.typeBarFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={styles.typeCount}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Recent alerts ─────────────────────────────────────────────── */}
      <div className={`card ${styles.recentCard}`}>
        <h2 className={styles.cardTitle}>Alertas recentes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severidade</th>
                <th>Tipo</th>
                <th>Alvo</th>
                <th>Detalhes</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {recentAlerts.map((a) => (
                <tr key={a.id}>
                  <td><span className={`badge badge-${a.severity}`}>{a.severity}</span></td>
                  <td className="td-muted">{a.typeLabel}</td>
                  <td className="td-mono">{a.target}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.details}</td>
                  <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtTs(a.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, color, bg, icon }) {
  return (
    <div className={styles.summaryCard} style={{ background: bg, borderColor: color + '44' }}>
      <div className={styles.summaryTop}>
        <span className={styles.summaryIcon}>{icon}</span>
        <span className={styles.summaryValue} style={{ color }}>{value}</span>
      </div>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summarySub}>{sub}</div>
    </div>
  )
}

function fmtTs(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
