import React, { useState, useEffect, useMemo } from 'react'
import Icon from '../components/Icon'
import PageHeader, { StatusPill } from '../components/PageHeader'
import { ALERT_TYPE_META, typeMeta, SEV_COLOR, fmtDateTime } from '../lib/meta'
import { getJson, postJson, msgErro } from '../lib/api'
import styles from './AlertsTable.module.css'

const SEV_ORDER = { ALTA: 0, MÉDIA: 1, BAIXA: 2 }

const SEV_FILTERS = [
  { key: '',      label: 'Todas' },
  { key: 'ALTA',  label: 'Alta' },
  { key: 'MÉDIA', label: 'Média' },
  { key: 'BAIXA', label: 'Baixa' },
]

export default function AlertsTable() {
  const [sevFilter, setSevFilter]   = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState('timestamp')
  const [sortDir, setSortDir]       = useState('desc')

  const [alerts, setAlerts]   = useState([])
  const [online, setOnline]   = useState(null)
  const [loading, setLoading] = useState(true)

  // Estado do pentest: false | 'run' | 'clean', e o resultado da última rodada.
  const [pentesting, setPentesting]       = useState(false)
  const [pentestResult, setPentestResult] = useState(null)

  function loadAlerts() {
    setLoading(true)
    return getJson('/api/alerts')
      .then((data) => { setAlerts(Array.isArray(data) ? data : []); setOnline(true) })
      .catch(() => setOnline(false))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAlerts() }, [])

  function runPentest(clean) {
    if (pentesting) return
    setPentesting(clean ? 'clean' : 'run')
    setPentestResult(null)
    postJson('/api/pentest', { clean: !!clean })
      .then((res) => {
        setAlerts(res.alerts || [])
        setOnline(true)
        setPentestResult({ ok: true, ...res })
      })
      .catch((e) => setPentestResult({ ok: false, error: msgErro(e) }))
      .finally(() => setPentesting(false))
  }

  const sevCounts = useMemo(() => {
    const c = { '': alerts.length, ALTA: 0, MÉDIA: 0, BAIXA: 0 }
    alerts.forEach((a) => { if (c[a.severity] !== undefined) c[a.severity] += 1 })
    return c
  }, [alerts])

  const filtered = useMemo(() => {
    let data = [...alerts]
    if (sevFilter)  data = data.filter((a) => a.severity === sevFilter)
    if (typeFilter) data = data.filter((a) => a.type === typeFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter(
        (a) =>
          String(a.target).toLowerCase().includes(q) ||
          String(a.details).toLowerCase().includes(q) ||
          String(a.typeLabel).toLowerCase().includes(q)
      )
    }
    data.sort((a, b) => {
      let va, vb
      if (sortKey === 'timestamp') {
        va = new Date(a.timestamp); vb = new Date(b.timestamp)
      } else if (sortKey === 'severity') {
        va = SEV_ORDER[a.severity]; vb = SEV_ORDER[b.severity]
      } else {
        va = a[sortKey]; vb = b[sortKey]
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return data
  }, [alerts, sevFilter, typeFilter, search, sortKey, sortDir])

  const hasFilter = sevFilter || typeFilter || search

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortHeader({ field, children }) {
    const active = sortKey === field
    const icon = !active ? 'arrowUpDown' : sortDir === 'asc' ? 'arrowUp' : 'arrowDown'
    return (
      <button className={`${styles.sortBtn} ${active ? styles.sortActive : ''}`} onClick={() => handleSort(field)}>
        {children}
        <Icon name={icon} size={12} />
      </button>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="02 — Registro" title="Alertas">
        <StatusPill online={online} loading={loading} />
        <span>
          {filtered.length} de {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
          {hasFilter ? ' com os filtros atuais' : ''}
        </span>
      </PageHeader>

      {/* ── Console: injeta ataques e mostra o que a detecção pegou ───── */}
      <div className={`card ${styles.console}`}>
        <div className={styles.consoleInfo}>
          <div className="card-title">Simular ataque</div>
          <p>Injeta os 7 padrões de ataque no banco e recarrega o que a detecção capturou.</p>
        </div>
        <div className={styles.consoleActions}>
          <button className="btn btn-danger" onClick={() => runPentest(false)} disabled={!!pentesting}>
            <Icon name={pentesting === 'run' ? 'loader' : 'zap'} size={15} className={pentesting === 'run' ? 'spin' : undefined} />
            {pentesting === 'run' ? 'Executando…' : 'Rodar pentest'}
          </button>
          <button className="btn" onClick={() => runPentest(true)} disabled={!!pentesting} title="Limpa logs e medições antes de atacar">
            <Icon name={pentesting === 'clean' ? 'loader' : 'eraser'} size={15} className={pentesting === 'clean' ? 'spin' : undefined} />
            Rodada limpa
          </button>
          <button className="btn btn-ghost" onClick={loadAlerts} disabled={!!pentesting || loading}>
            <Icon name="refresh" size={15} className={loading ? 'spin' : undefined} />
            Atualizar
          </button>
        </div>
      </div>

      {pentestResult && (
        pentestResult.ok ? (
          <div className="notice notice-ok">
            <Icon name="checkCircle" size={16} />
            <div>
              <strong>
                {pentestResult.injectedCount} técnicas injetadas, {pentestResult.detectedCount} alerta
                {pentestResult.detectedCount !== 1 ? 's' : ''} detectado{pentestResult.detectedCount !== 1 ? 's' : ''}
                {pentestResult.cleaned ? ' (rodada limpa)' : ''}.
              </strong>{' '}
              <span>A detecção capturou os padrões listados abaixo.</span>
            </div>
          </div>
        ) : (
          <div className="notice notice-err">
            <Icon name="alert" size={16} />
            <div><strong>O pentest não rodou.</strong> <span>{pentestResult.error}</span></div>
          </div>
        )
      )}

      {/* ── Filtros ───────────────────────────────────────────────────── */}
      <div className={styles.filters}>
        <label className={`input-icon ${styles.search}`}>
          <Icon name="search" size={15} />
          <input
            className="input-field"
            type="text"
            placeholder="Buscar por alvo, detalhe ou técnica"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="seg" role="group" aria-label="Filtrar por severidade">
          {SEV_FILTERS.map((f) => (
            <button
              key={f.key || 'all'}
              className={sevFilter === f.key ? 'on' : ''}
              style={f.key ? { '--c': SEV_COLOR[f.key] } : undefined}
              onClick={() => setSevFilter(f.key)}
            >
              {f.key && <span className="seg-dot" />}
              {f.label}
              <span className="seg-count">{sevCounts[f.key]}</span>
            </button>
          ))}
        </div>

        <select className="select-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Todas as técnicas</option>
          {Object.entries(ALERT_TYPE_META).map(([key, m]) => (
            <option key={key} value={key}>{m.label}</option>
          ))}
        </select>

        {hasFilter && (
          <button className="btn btn-ghost" onClick={() => { setSevFilter(''); setTypeFilter(''); setSearch('') }}>
            <Icon name="x" size={14} />
            Limpar
          </button>
        )}
      </div>

      {/* ── Tabela ────────────────────────────────────────────────────── */}
      <div className="card card-flush">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Icon name={alerts.length ? 'search' : 'bell'} size={18} /></span>
            {alerts.length ? (
              <><strong>Nada com esses filtros</strong>Ajuste a busca ou limpe os filtros.</>
            ) : (
              <><strong>Nenhum alerta ativo</strong>Rode o pentest acima para gerar detecções.</>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><SortHeader field="severity">Severidade</SortHeader></th>
                  <th>Técnica</th>
                  <th>Alvo / origem</th>
                  <th>Detalhes</th>
                  <th><SortHeader field="timestamp">Horário</SortHeader></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const meta = typeMeta(a.type, a.typeLabel)
                  return (
                    <tr key={a.id}>
                      <td><span className={`badge badge-${a.severity}`}>{a.severity}</span></td>
                      <td>
                        <span className={styles.typeCell} style={{ '--c': SEV_COLOR[a.severity] }}>
                          <span className={styles.typeIcon}><Icon name={meta.icon} size={14} /></span>
                          {a.typeLabel || meta.label}
                        </span>
                      </td>
                      <td className="td-mono">{a.target}</td>
                      <td className={styles.detailCell}>{a.details}</td>
                      <td className={`td-mono td-muted ${styles.tsCell}`}>{fmtDateTime(a.timestamp)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
