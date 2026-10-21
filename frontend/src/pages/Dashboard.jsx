import React, { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import Icon from '../components/Icon'
import PageHeader, { StatusPill } from '../components/PageHeader'
import { typeMeta, SEV_COLOR, fmtDateTime, fmtTime } from '../lib/meta'
import { getJson, postJson, msgErro } from '../lib/api'
import styles from './Dashboard.module.css'

const SEVERIDADES = [
  { key: 'ALTA',  label: 'Alta',  caption: 'exigem ação imediata' },
  { key: 'MÉDIA', label: 'Média', caption: 'monitorar de perto' },
  { key: 'BAIXA', label: 'Baixa', caption: 'registradas para auditoria' },
]

const GAUGE_TICKS = 20

// Índice simples: alta pesa 3, média 2, baixa 1.
function nivelDeAmeaca(counts) {
  const score = counts.ALTA * 3 + counts['MÉDIA'] * 2 + counts.BAIXA
  if (score === 0) {
    return { label: 'Estável', color: 'var(--ok)', score, desc: 'Nenhuma anomalia ativa nas janelas de detecção.' }
  }
  if (score < 8) {
    return { label: 'Atenção', color: 'var(--sev-med)', score, desc: 'Há sinais suspeitos nos logs — vale investigar.' }
  }
  return { label: 'Crítico', color: 'var(--sev-high)', score, desc: 'Padrões de ataque ativos detectados no banco.' }
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((p) => (
        <p key={p.name}>
          <i style={{ background: p.color }} />
          {p.name.toLowerCase()} <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  // Começa zerado; só enche com o que a API real detectar (ex.: após o pentest).
  const [alerts, setAlerts] = useState([])
  const [online, setOnline] = useState(null)
  const [busy, setBusy]     = useState(false)   // false | 'pentest' | 'reset'
  const [aviso, setAviso]   = useState(null)

  function refetch() {
    return getJson('/api/alerts')
      .then((data) => { setAlerts(Array.isArray(data) ? data : []); setOnline(true) })
      .catch(() => setOnline(false))
  }

  useEffect(() => {
    refetch()
    // Atualiza sozinho a cada 5s, então rodar o pentest reflete aqui sem recarregar.
    const timer = setInterval(refetch, 5000)
    return () => clearInterval(timer)
  }, [])

  function rodarPentest() {
    if (busy) return
    setBusy('pentest'); setAviso(null)
    postJson('/api/pentest', { clean: true })
      .then((res) => {
        setAlerts(res.alerts || [])
        setOnline(true)
        setAviso({ ok: true, msg: `${res.injectedCount} técnicas injetadas · ${res.detectedCount} alertas detectados` })
      })
      .catch((e) => setAviso({ ok: false, msg: msgErro(e) }))
      .finally(() => setBusy(false))
  }

  function zerarPainel() {
    if (busy) return
    setBusy('reset'); setAviso(null)
    postJson('/api/reset')
      .then(() => refetch())
      .then(() => setAviso({ ok: true, msg: 'painel zerado · pronto para uma nova simulação' }))
      .catch((e) => setAviso({ ok: false, msg: msgErro(e) }))
      .finally(() => setBusy(false))
  }

  const counts = useMemo(() => ({
    ALTA:  alerts.filter((a) => a.severity === 'ALTA').length,
    MÉDIA: alerts.filter((a) => a.severity === 'MÉDIA').length,
    BAIXA: alerts.filter((a) => a.severity === 'BAIXA').length,
    total: alerts.length,
  }), [alerts])

  const nivel = nivelDeAmeaca(counts)
  const ticksOn = nivel.score === 0 ? 0 : Math.max(1, Math.min(GAUGE_TICKS, Math.round((nivel.score / 24) * GAUGE_TICKS)))

  const typeRows = useMemo(() => {
    const map = {}
    alerts.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1 })
    const max = Math.max(1, ...Object.values(map))
    return Object.entries(map)
      .map(([type, count]) => ({ type, count, pct: (count / max) * 100, ...typeMeta(type) }))
      .sort((a, b) => b.count - a.count)
  }, [alerts])

  const overTime = useMemo(() => buildOverTime(alerts), [alerts])

  const recentAlerts = useMemo(
    () => [...alerts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6),
    [alerts]
  )
  const ultima = recentAlerts[0]?.timestamp

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="01 — Visão geral" title="Centro de detecção">
        <StatusPill online={online} />
        <span>Varredura da trilha de auditoria · atualiza a cada 5 s</span>
      </PageHeader>

      {online === false && (
        <div className="notice notice-err">
          <Icon name="alert" size={16} />
          <div>
            <strong>A API não está respondendo.</strong>{' '}
            <span>Confira se o MySQL está ligado (usuário e senha do db_config.py) e reinicie pelo iniciar.bat.</span>
          </div>
        </div>
      )}

      {/* ── Nível de ameaça + console ─────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={`card ${styles.threat}`} style={{ '--level': nivel.color }}>
          <div className="card-title">Nível de ameaça</div>
          <div className={styles.threatMain}>
            <span className={styles.threatLabel}>{nivel.label}</span>
            <span className={styles.threatScore}>índice {String(nivel.score).padStart(2, '0')}</span>
          </div>
          <div className={styles.gauge} aria-hidden="true">
            {Array.from({ length: GAUGE_TICKS }, (_, i) => (
              <span key={i} className={`${styles.tick} ${i < ticksOn ? styles.tickOn : ''}`} />
            ))}
          </div>
          <p className={styles.threatDesc}>{nivel.desc}</p>
          <div className={styles.threatFoot}>
            <span><strong>{counts.total}</strong> alertas ativos</span>
            <span>última detecção <strong>{ultima ? fmtTime(ultima) : '—'}</strong></span>
          </div>
        </div>

        <div className={`card ${styles.console}`}>
          <div className="card-title">Console de simulação</div>
          <p className={styles.consoleText}>
            Grava no banco os rastros que um invasor deixaria — movimentação lateral, força bruta,
            SQL injection e mais quatro técnicas — e deixa a detecção trabalhar.
          </p>
          <div className={styles.consoleActions}>
            <button className="btn btn-danger" onClick={rodarPentest} disabled={!!busy}>
              <Icon name={busy === 'pentest' ? 'loader' : 'zap'} size={15} className={busy === 'pentest' ? 'spin' : undefined} />
              {busy === 'pentest' ? 'Executando…' : 'Rodar pentest'}
            </button>
            <button className="btn" onClick={zerarPainel} disabled={!!busy}>
              <Icon name={busy === 'reset' ? 'loader' : 'rotate'} size={15} className={busy === 'reset' ? 'spin' : undefined} />
              Zerar painel
            </button>
          </div>
          <div className={styles.consoleLog} data-state={aviso ? (aviso.ok ? 'ok' : 'err') : 'idle'}>
            <span className={styles.prompt}>$</span>
            <span>
              {busy ? (busy === 'pentest' ? 'injetando ataques…' : 'limpando registros…') : aviso ? aviso.msg : 'aguardando comando'}
              {!busy && !aviso && <span className={styles.cursor} />}
            </span>
          </div>
        </div>
      </section>

      {/* ── Contadores ────────────────────────────────────────────────── */}
      <section className={styles.stats}>
        <StatCard label="Total" value={counts.total} caption="nas janelas de detecção" color="var(--accent)" />
        {SEVERIDADES.map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={counts[s.key]}
            caption={s.caption}
            color={SEV_COLOR[s.key]}
            share={counts.total ? counts[s.key] / counts.total : 0}
          />
        ))}
      </section>

      {/* ── Linha do tempo + técnicas ─────────────────────────────────── */}
      <section className={styles.chartRow}>
        <div className="card">
          <div className={styles.cardHead}>
            <div className="card-title">Linha do tempo · hoje</div>
            <div className={styles.legend}>
              {SEVERIDADES.map((s) => (
                <span key={s.key}><i style={{ background: SEV_COLOR[s.key] }} />{s.label}</span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={overTime} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <defs>
                {SEVERIDADES.map((s) => (
                  <linearGradient key={s.key} id={`grad-${s.label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SEV_COLOR[s.key]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={SEV_COLOR[s.key]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="var(--border-strong)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-strong)' }} />
              {SEVERIDADES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={SEV_COLOR[s.key]}
                  fill={`url(#grad-${s.label})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Por técnica de ataque</div>
          {typeRows.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><Icon name="target" size={18} /></span>
              <strong>Nenhuma técnica detectada</strong>
              Rode o pentest para ver o que a detecção captura.
            </div>
          ) : (
            <div className={styles.typeList}>
              {typeRows.map((t) => (
                <div key={t.type} className={styles.typeRow}>
                  <span className={styles.typeIcon}><Icon name={t.icon} size={14} /></span>
                  <div className={styles.typeBody}>
                    <div className={styles.typeLabel}>{t.label}</div>
                    <div className={styles.typeBar}><span style={{ width: `${t.pct}%` }} /></div>
                  </div>
                  <span className={styles.typeCount}>{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Detecções recentes ────────────────────────────────────────── */}
      <section className="card card-flush">
        <div className={`${styles.cardHead} ${styles.cardHeadPad}`}>
          <div className="card-title">Detecções recentes</div>
          <Link to="/alerts" className={styles.seeAll}>
            ver todas <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        {recentAlerts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Icon name="bell" size={18} /></span>
            <strong>Silêncio nos logs</strong>
            Nenhum alerta no momento. Use o console acima para simular um ataque.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Severidade</th>
                  <th>Técnica</th>
                  <th>Alvo</th>
                  <th>Detalhes</th>
                  <th>Horário</th>
                </tr>
              </thead>
              <tbody>
                {recentAlerts.map((a) => {
                  const meta = typeMeta(a.type, a.typeLabel)
                  return (
                    <tr key={a.id}>
                      <td><span className={`badge badge-${a.severity}`}>{a.severity}</span></td>
                      <td>
                        <span className={styles.typeCell} style={{ '--c': SEV_COLOR[a.severity] }}>
                          <Icon name={meta.icon} size={14} />
                          {a.typeLabel || meta.label}
                        </span>
                      </td>
                      <td className="td-mono">{a.target}</td>
                      <td className={styles.detailCell}>{a.details}</td>
                      <td className="td-mono td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.timestamp)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, caption, color, share }) {
  const temShare = typeof share === 'number'
  return (
    <div className={styles.stat} style={{ '--c': color }}>
      <div className={styles.statHead}>
        <span className={styles.statLabel}><i className={styles.statDot} />{label}</span>
        {temShare && <span className={styles.statPct}>{Math.round(share * 100)}%</span>}
      </div>
      <div className={`${styles.statValue} ${value === 0 ? styles.statZero : ''}`}>{value}</div>
      <div className={styles.statCaption}>{caption}</div>
      <div className={styles.statBar}>
        <span style={{ width: `${temShare ? share * 100 : value > 0 ? 100 : 0}%` }} />
      </div>
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
