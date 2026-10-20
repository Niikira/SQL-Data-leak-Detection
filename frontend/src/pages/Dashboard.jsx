import React, { useMemo, useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
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
  // Começa zerado; só enche com o que a API real detectar (ex.: após o pentest).
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    let cancelado = false
    const carregar = () =>
      fetch('/api/alerts')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => { if (!cancelado) setAlerts(Array.isArray(data) ? data : []) })
        .catch(() => { if (!cancelado) setAlerts([]) })
    carregar()
    // Atualiza sozinho a cada 5s, então rodar o pentest reflete aqui sem recarregar.
    const timer = setInterval(carregar, 5000)
    return () => { cancelado = true; clearInterval(timer) }
  }, [])

  const [busy, setBusy]     = useState(false)
  const [aviso, setAviso]   = useState(null)

  function refetch() {
    return fetch('/api/alerts')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  function rodarPentest() {
    if (busy) return
    setBusy(true); setAviso(null)
    fetch('/api/pentest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clean: true }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error)
        setAlerts(res.alerts || [])
        setAviso({ ok: true, msg: `✅ ${res.injectedCount} ataques injetados — ${res.detectedCount} alertas detectados.` })
      })
      .catch((e) => setAviso({ ok: false, msg: '⚠️ ' + (e.message || e) }))
      .finally(() => setBusy(false))
  }

  function zerarPainel() {
    if (busy) return
    setBusy(true); setAviso(null)
    fetch('/api/reset', { method: 'POST' })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error)
        return refetch()
      })
      .then(() => setAviso({ ok: true, msg: '🧹 Painel zerado. Rode o pentest para gerar detecções.' }))
      .catch((e) => setAviso({ ok: false, msg: '⚠️ ' + (e.message || e) }))
      .finally(() => setBusy(false))
  }

  const counts = useMemo(() => ({
    ALTA:  alerts.filter((a) => a.severity === 'ALTA').length,
    MÉDIA: alerts.filter((a) => a.severity === 'MÉDIA').length,
    BAIXA: alerts.filter((a) => a.severity === 'BAIXA').length,
    total: alerts.length,
  }), [alerts])

  const typeCounts = useMemo(() => {
    const map = {}
    alerts.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1 })
    return map
  }, [alerts])

  const overTime = useMemo(() => buildOverTime(alerts), [alerts])

  const recentAlerts = useMemo(
    () => [...alerts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5),
    [alerts]
  )

  return (
    <div className={styles.page}>
      {/* ── Demo: pentest / zerar ─────────────────────────────────────── */}
      <div className={styles.demoBar}>
        <div>
          <strong>Simulado de pentest</strong>
          <span className={styles.demoHint}> — zere o painel, rode o pentest e veja os números subirem.</span>
        </div>
        <div className={styles.demoBtns}>
          <button className="btn" onClick={rodarPentest} disabled={busy}>
            {busy ? '⏳ Processando…' : '🔴 Rodar Pentest'}
          </button>
          <button className="btn" onClick={zerarPainel} disabled={busy}>
            🧹 Zerar painel
          </button>
        </div>
      </div>
      {aviso && (
        <div className={`${styles.demoAviso} ${aviso.ok ? styles.avisoOk : styles.avisoErr}`}>
          {aviso.msg}
        </div>
      )}

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
            <AreaChart data={overTime} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
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
              {recentAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    Nenhum alerta no momento. Rode o pentest na aba “Alertas” para gerar detecções.
                  </td>
                </tr>
              ) : (
                recentAlerts.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`badge badge-${a.severity}`}>{a.severity}</span></td>
                    <td className="td-muted">{a.typeLabel}</td>
                    <td className="td-mono">{a.target}</td>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.details}</td>
                    <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtTs(a.timestamp)}</td>
                  </tr>
                ))
              )}
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

// Agrupa os alertas reais por hora do dia (HH:00) para o gráfico.
// Sem alertas, devolve as últimas 6 horas zeradas — o gráfico fica achatado no 0.
function buildOverTime(alerts) {
  const byHour = {}
  alerts.forEach((a) => {
    const d = new Date(a.timestamp)
    if (isNaN(d)) return
    const key = `${String(d.getHours()).padStart(2, '0')}:00`
    if (!byHour[key]) byHour[key] = { hour: key, ALTA: 0, 'MÉDIA': 0, BAIXA: 0 }
    if (byHour[key][a.severity] !== undefined) byHour[key][a.severity] += 1
  })
  let rows = Object.values(byHour).sort((x, y) => x.hour.localeCompare(y.hour))
  if (rows.length === 0) {
    const nowH = new Date().getHours()
    rows = Array.from({ length: 6 }, (_, i) => {
      const h = (nowH - (5 - i) + 24) % 24
      return { hour: `${String(h).padStart(2, '0')}:00`, ALTA: 0, 'MÉDIA': 0, BAIXA: 0 }
    })
  }
  return rows
}

function fmtTs(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
