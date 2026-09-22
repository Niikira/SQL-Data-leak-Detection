import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { MOCK_MEASUREMENTS } from '../data/mockData'
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
  normal: 'var(--chart-ok)',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const meas = payload.find((p) => p.dataKey === 'measurements24h')
  const sev  = meas ? severityOf(meas.value) : 'normal'
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.fill || p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
      {meas && sev !== 'normal' && (
        <p className={styles.tooltipWarn}>
          ⚠️ {sev === 'ALTA' ? `Acima do limiar crítico (${THRESHOLD})` : `Acima do limiar de atenção (${WARNING})`}
        </p>
      )}
    </div>
  )
}

export default function MeasurementsExport() {
  const data = useMemo(
    () => MOCK_MEASUREMENTS.map((m) => ({ ...m, sev: severityOf(m.measurements24h) })),
    []
  )

  const anomalous = data.filter((d) => d.sev !== 'normal')

  return (
    <div className={styles.page}>
      <div className="page-header">
        <h1>Medições por Loja — Últimas 24h</h1>
        <p>
          Baseline esperado: ~{BASELINE} medições/dia. Limiar de atenção: {WARNING}+. Limiar crítico: {THRESHOLD}+.
        </p>
      </div>

      {/* Alert banner */}
      {anomalous.length > 0 && (
        <div className={styles.banner}>
          <span className={styles.bannerIcon}>🚨</span>
          <div>
            <strong>{anomalous.length} loja{anomalous.length !== 1 ? 's' : ''} com volume anômalo</strong>
            <p>
              {anomalous.map((d) => `${d.store} (${d.measurements24h})`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Bar chart */}
      <div className={`card ${styles.chartCard}`}>
        <h2 className={styles.cardTitle}>Volume de medições por loja (24h vs. baseline)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 10, right: 24, left: -10, bottom: 0 }} barGap={6}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="store"
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 8 }}
            />
            {/* Reference lines */}
            <ReferenceLine
              y={BASELINE}
              stroke="var(--chart-ok)"
              strokeDasharray="4 4"
              label={{ value: `Baseline (${BASELINE})`, fill: 'var(--chart-ok)', fontSize: 11, position: 'insideTopRight' }}
            />
            <ReferenceLine
              y={WARNING}
              stroke="var(--sev-med)"
              strokeDasharray="4 4"
              label={{ value: `Atenção (${WARNING})`, fill: 'var(--sev-med)', fontSize: 11, position: 'insideTopRight' }}
            />
            <ReferenceLine
              y={THRESHOLD}
              stroke="var(--sev-high)"
              strokeDasharray="4 4"
              label={{ value: `Crítico (${THRESHOLD})`, fill: 'var(--sev-high)', fontSize: 11, position: 'insideTopRight' }}
            />
            <Bar dataKey="measurements24h" name="Medições 24h" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.store} fill={COLOR_MAP[entry.sev]} />
              ))}
            </Bar>
            <Bar dataKey="baseline" name="Baseline esperado" fill="var(--border)" radius={[4, 4, 0, 0]} opacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="card">
        <h2 className={styles.cardTitle}>Detalhamento por loja</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loja</th>
                <th>Medições 24h</th>
                <th>Baseline</th>
                <th>Desvio</th>
                <th>Fator</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const desvio = row.measurements24h - row.baseline
                const fator  = (row.measurements24h / row.baseline).toFixed(1)
                return (
                  <tr key={row.store}>
                    <td style={{ fontWeight: 600 }}>{row.store}</td>
                    <td style={{ color: COLOR_MAP[row.sev], fontWeight: 700 }}>
                      {row.measurements24h}
                    </td>
                    <td className="td-muted">{row.baseline}</td>
                    <td style={{ color: desvio > 0 ? COLOR_MAP[row.sev] : 'var(--chart-ok)' }}>
                      {desvio > 0 ? '+' : ''}{desvio}
                    </td>
                    <td className="td-mono" style={{ color: COLOR_MAP[row.sev] }}>
                      {fator}×
                    </td>
                    <td>
                      {row.sev === 'normal'
                        ? <span className="badge badge-BAIXA">Normal</span>
                        : <span className={`badge badge-${row.sev}`}>{row.sev}</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
