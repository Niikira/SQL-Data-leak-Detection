import React, { useMemo, useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import Icon from '../components/Icon'
import PageHeader, { StatusPill } from '../components/PageHeader'
import { getJson } from '../lib/api'
import styles from './MeasurementsExport.module.css'

const THRESHOLD = 50   // acima disso → ALTA
const WARNING   = 30   // acima disso → MÉDIA
const BASELINE  = 12

function severityOf(v) {
  if (v > THRESHOLD) return 'ALTA'
  if (v > WARNING)   return 'MÉDIA'
  return 'normal'
}

const COLOR_MAP = {
  ALTA:   'var(--sev-high)',
  MÉDIA:  'var(--sev-med)',
  normal: 'var(--ok)',
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const meas = payload.find((p) => p.dataKey === 'measurements24h')
  const sev  = meas ? severityOf(meas.value) : 'normal'
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey}>{p.name.toLowerCase()} <strong>{p.value}</strong></p>
      ))}
      {meas && sev !== 'normal' && (
        <p className={styles.tooltipWarn}>
          {sev === 'ALTA' ? `acima do limiar crítico (${THRESHOLD})` : `acima do limiar de atenção (${WARNING})`}
        </p>
      )}
    </div>
  )
}

export default function MeasurementsExport() {
  const [rows, setRows]     = useState([])
  const [online, setOnline] = useState(null)

  useEffect(() => {
    let cancelado = false
    const carregar = () =>
      getJson('/api/measurements')
        .then((d) => { if (!cancelado) { setRows(Array.isArray(d) ? d : []); setOnline(true) } })
        .catch(() => { if (!cancelado) setOnline(false) })
    carregar()
    const timer = setInterval(carregar, 5000)
    return () => { cancelado = true; clearInterval(timer) }
  }, [])

  const data = useMemo(
    () => rows.map((m) => ({ ...m, sev: severityOf(m.measurements24h) })),
    [rows]
  )
  const anomalous = data.filter((d) => d.sev !== 'normal')
  const yMax = Math.max(THRESHOLD + 10, ...data.map((d) => d.measurements24h))

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="05 — Exfiltração" title="Medições por loja">
        <StatusPill online={online} />
        <span>Últimas 24 h · base ~{BASELINE}/dia · atenção {WARNING}+ · crítico {THRESHOLD}+</span>
      </PageHeader>

      {anomalous.length > 0 && (
        <div className="notice notice-high">
          <Icon name="upload" size={16} />
          <div>
            <strong>{anomalous.length} loja{anomalous.length !== 1 ? 's' : ''} com volume anômalo — possível exportação de dados.</strong>{' '}
            <span>{anomalous.map((d) => `${d.store} (${d.measurements24h})`).join(' · ')}</span>
          </div>
        </div>
      )}

      {data.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-icon"><Icon name="bars" size={18} /></span>
            <strong>Nenhuma medição nas últimas 24 h</strong>
            Rode o pentest na aba Alertas para simular uma exportação massiva.
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className={styles.cardHead}>
              <div className="card-title">Volume por loja · 24 h vs. base</div>
              <div className={styles.legend}>
                <span><i style={{ background: 'var(--ok)' }} />normal</span>
                <span><i style={{ background: 'var(--sev-med)' }} />atenção</span>
                <span><i style={{ background: 'var(--sev-high)' }} />crítico</span>
                <span><i style={{ background: 'var(--border-strong)' }} />base</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 16, right: 12, left: -16, bottom: 0 }} barGap={6}>
                <CartesianGrid strokeDasharray="2 6" stroke="var(--border-strong)" vertical={false} />
                <XAxis dataKey="store" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis domain={[0, yMax]} tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <ReferenceLine y={BASELINE} stroke="var(--ok)" strokeDasharray="4 4" strokeOpacity={0.6}
                  label={{ value: `base ${BASELINE}`, fill: 'var(--ok)', fontSize: 10.5, position: 'insideTopRight' }} />
                <ReferenceLine y={WARNING} stroke="var(--sev-med)" strokeDasharray="4 4" strokeOpacity={0.6}
                  label={{ value: `atenção ${WARNING}`, fill: 'var(--sev-med)', fontSize: 10.5, position: 'insideTopRight' }} />
                <ReferenceLine y={THRESHOLD} stroke="var(--sev-high)" strokeDasharray="4 4" strokeOpacity={0.7}
                  label={{ value: `crítico ${THRESHOLD}`, fill: 'var(--sev-high)', fontSize: 10.5, position: 'insideTopRight' }} />
                <Bar dataKey="measurements24h" name="Medições 24h" radius={[4, 4, 0, 0]} maxBarSize={72}>
                  {data.map((entry) => (
                    <Cell key={entry.store} fill={COLOR_MAP[entry.sev]} />
                  ))}
                </Bar>
                <Bar dataKey="baseline" name="Base esperada" fill="var(--border-strong)" radius={[4, 4, 0, 0]} maxBarSize={72} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card card-flush">
            <div className={styles.tableHead}><div className="card-title">Detalhamento por loja</div></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Loja</th>
                    <th>Medições 24 h</th>
                    <th>Base</th>
                    <th>Desvio</th>
                    <th>Fator</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    const desvio = row.measurements24h - row.baseline
                    const fator  = (row.measurements24h / row.baseline).toFixed(1)
                    const cor    = COLOR_MAP[row.sev]
                    return (
                      <tr key={row.store}>
                        <td>
                          <span className={styles.storeCell}><Icon name="store" size={14} />{row.store}</span>
                        </td>
                        <td className="td-mono" style={{ color: cor, fontWeight: 600 }}>{row.measurements24h}</td>
                        <td className="td-mono td-muted">{row.baseline}</td>
                        <td className="td-mono" style={{ color: desvio > 0 ? cor : 'var(--ok)' }}>
                          {desvio > 0 ? '+' : ''}{desvio}
                        </td>
                        <td className="td-mono" style={{ color: cor }}>{fator}×</td>
                        <td>
                          {row.sev === 'normal'
                            ? <span className="badge badge-OK">Normal</span>
                            : <span className={`badge badge-${row.sev}`}>{row.sev}</span>}
                        </td>
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
