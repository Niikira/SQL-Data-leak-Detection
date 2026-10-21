import React, { useState, useMemo, useEffect } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { getJson } from '../lib/api'
import styles from './IpInvestigation.module.css'

const EVENT_META = {
  login_success:   { label: 'Login bem-sucedido',      color: 'var(--ok)',       icon: 'checkCircle' },
  login_fail:      { label: 'Falha de login',          color: 'var(--sev-high)', icon: 'xCircle' },
  login_failed:    { label: 'Falha de login',          color: 'var(--sev-high)', icon: 'xCircle' },
  login_attempt:   { label: 'Tentativa suspeita',      color: 'var(--sev-high)', icon: 'code' },
  token_invalid:   { label: 'Token inválido',          color: 'var(--sev-med)',  icon: 'key' },
  priv_escalation: { label: 'Escalação de privilégio', color: 'var(--violet)',   icon: 'trendUp' },
}
function eventMeta(type) {
  return EVENT_META[type] || { label: type, color: 'var(--text-secondary)', icon: 'info' }
}

// "IPs" que na verdade são payloads de SQL injection gravados no campo de log.
const PAYLOAD_RE = /['";]|--|\/\*|\b(union|select|drop|insert|update|delete)\b/i
const isPayload = (s) => PAYLOAD_RE.test(s)

export default function IpInvestigation() {
  const [query, setQuery]           = useState('')
  const [ip, setIp]                 = useState('')
  const [filterType, setFilterType] = useState('')
  const [knownIps, setKnownIps]     = useState([])
  const [rawEvents, setRawEvents]   = useState([])
  const [loading, setLoading]       = useState(false)

  // IPs conhecidos (dos logs) para sugestão/atalhos.
  useEffect(() => {
    let cancelado = false
    getJson('/api/known-ips')
      .then((d) => { if (!cancelado) setKnownIps(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelado) setKnownIps([]) })
    return () => { cancelado = true }
  }, [])

  // Eventos do IP investigado.
  useEffect(() => {
    if (!ip) { setRawEvents([]); return }
    let cancelado = false
    setLoading(true)
    getJson('/api/ip-events?ip=' + encodeURIComponent(ip))
      .then((d) => { if (!cancelado) setRawEvents(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelado) setRawEvents([]) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [ip])

  const events = useMemo(() => {
    const filtered = filterType ? rawEvents.filter((e) => e.eventType === filterType) : rawEvents
    return [...filtered].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
  }, [rawEvents, filterType])

  const eventTypeCounts = useMemo(
    () => rawEvents.reduce((acc, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc }, {}),
    [rawEvents]
  )

  const span = useMemo(() => {
    if (rawEvents.length < 2) return null
    const ts = rawEvents.map((e) => new Date(e.occurredAt).getTime())
    const min = Math.round((Math.max(...ts) - Math.min(...ts)) / 60000)
    return min
  }, [rawEvents])

  function investigar(valor) {
    setQuery(valor)
    setIp(valor)
    setFilterType('')
  }

  function handleSearch(e) {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) investigar(trimmed)
  }

  const suggestions = knownIps.filter((k) => query.length > 0 && k !== query && k.includes(query)).slice(0, 8)

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="04 — Forense" title="Investigar IP">
        <span>Reconstrói, em ordem cronológica, tudo o que um endereço fez nos logs de auditoria.</span>
      </PageHeader>

      {/* ── Busca ─────────────────────────────────────────────────────── */}
      <form className={styles.searchForm} onSubmit={handleSearch}>
        <div className={styles.inputWrap}>
          <label className="input-icon">
            <Icon name="crosshair" size={15} />
            <input
              className={`input-field ${styles.ipInput}`}
              type="text"
              placeholder="Endereço IP, ex.: 198.51.100.23"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setFilterType('') }}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {suggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {suggestions.map((s) => (
                <li key={s} onClick={() => investigar(s)}>
                  <Icon name={isPayload(s) ? 'code' : 'globe'} size={13} />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className="btn btn-primary">
          <Icon name="search" size={15} />
          Investigar
        </button>
      </form>

      {/* ── Atalhos: IPs vistos nos logs ──────────────────────────────── */}
      {!ip && (
        knownIps.length > 0 ? (
          <div className="card">
            <div className="card-title">Origens vistas nos logs</div>
            <div className={styles.chips}>
              {knownIps.map((k) => {
                const payload = isPayload(k)
                return (
                  <button key={k} className={`${styles.chip} ${payload ? styles.chipDanger : ''}`} onClick={() => investigar(k)}>
                    <Icon name={payload ? 'code' : 'globe'} size={12} />
                    <span className={styles.chipText}>{k}</span>
                    {payload && <span className={styles.chipTag}>payload</span>}
                  </button>
                )
              })}
            </div>
            <p className={styles.chipsHint}>
              Itens marcados como <em>payload</em> não são IPs: são tentativas de SQL injection que caíram no campo de origem.
            </p>
          </div>
        ) : (
          <div className="card">
            <div className="empty-state">
              <span className="empty-icon"><Icon name="crosshair" size={18} /></span>
              <strong>Nenhuma origem nos logs ainda</strong>
              Rode o pentest na aba Alertas e volte aqui para seguir o rastro.
            </div>
          </div>
        )
      )}

      {/* ── Resultado ─────────────────────────────────────────────────── */}
      {ip && (
        <>
          <div className={`card ${styles.summary}`}>
            <div className={styles.summaryTop}>
              <div>
                <div className={styles.summaryLabel}>Alvo da investigação</div>
                <div className={`${styles.ipAddr} ${isPayload(ip) ? styles.ipDanger : ''}`}>{ip}</div>
              </div>
              <div className={styles.summaryStats}>
                <div><span>{rawEvents.length}</span>eventos</div>
                <div><span>{Object.keys(eventTypeCounts).length}</span>tipos</div>
                <div><span>{span == null ? '—' : `${span}m`}</span>janela</div>
              </div>
              <button className="btn btn-ghost" onClick={() => investigar('')}>
                <Icon name="x" size={14} />
                Nova busca
              </button>
            </div>
            {Object.keys(eventTypeCounts).length > 0 && (
              <div className={styles.typeChips}>
                {Object.entries(eventTypeCounts).map(([type, count]) => {
                  const meta = eventMeta(type)
                  return (
                    <button
                      key={type}
                      className={`${styles.typeChip} ${filterType === type ? styles.typeChipActive : ''}`}
                      style={{ '--chip-color': meta.color }}
                      onClick={() => setFilterType((f) => (f === type ? '' : type))}
                    >
                      <Icon name={meta.icon} size={13} />
                      {meta.label}
                      <strong>{count}</strong>
                    </button>
                  )
                })}
                {filterType && (
                  <button className={styles.clearFilter} onClick={() => setFilterType('')}>limpar filtro</button>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="card"><div className="empty-state"><span className="empty-icon"><Icon name="loader" size={18} className="spin" /></span>Reconstruindo a linha do tempo…</div></div>
          ) : events.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <span className="empty-icon"><Icon name="search" size={18} /></span>
                {rawEvents.length > 0
                  ? <><strong>Nada com esse filtro</strong>Selecione outro tipo de evento.</>
                  : <><strong>Sem rastros</strong>Nenhum evento registrado para “{ip}”.</>}
              </div>
            </div>
          ) : (
            <div className={styles.timeline}>
              {events.map((ev, idx) => {
                const meta = eventMeta(ev.eventType)
                const ts = new Date(ev.occurredAt)
                return (
                  <div key={ev.id} className={styles.item} style={{ '--c': meta.color }}>
                    <div className={styles.rail}>
                      <span className={styles.node}><Icon name={meta.icon} size={13} /></span>
                      {idx < events.length - 1 && <span className={styles.line} />}
                    </div>
                    <div className={`card ${styles.event}`}>
                      <div className={styles.eventHead}>
                        <span className={styles.eventSeq}>#{String(idx + 1).padStart(2, '0')}</span>
                        <span className={styles.eventType}>{meta.label}</span>
                        <span className={styles.eventTs}>
                          {ts.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <div className={styles.eventBody}>
                        <Field icon="user" label="Usuário" value={ev.userId} mono />
                        <Field icon="store" label="Loja" value={ev.storeId} />
                        <Field icon="message" label="Detalhe" value={ev.detail} />
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className={styles.timelineEnd}>fim da linha do tempo · {events.length} evento{events.length !== 1 ? 's' : ''}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Field({ icon, label, value, mono }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}><Icon name={icon} size={12} />{label}</span>
      <span className={`${styles.fieldValue} ${mono ? 'td-mono' : ''}`}>{value}</span>
    </div>
  )
}
