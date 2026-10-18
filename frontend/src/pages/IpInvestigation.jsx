import React, { useState, useMemo, useEffect } from 'react'
import { useRealtime } from '../context/RealtimeContext'
import { MOCK_IP_EVENTS, KNOWN_IPS } from '../data/mockData'
import styles from './IpInvestigation.module.css'

const EVENT_META = {
  login_success:   { label: 'Login bem-sucedido', color: '#22c55e',  icon: '✅' },
  login_failed:    { label: 'Falha de login',     color: '#ef4444',  icon: '❌' },
  token_invalid:   { label: 'Token inválido',     color: '#f59e0b',  icon: '🔑' },
  priv_escalation: { label: 'Escalação de priv.', color: '#a855f7',  icon: '⬆️' },
  login_attempt:   { label: 'Tentativa suspeita', color: '#ec4899',  icon: '⚡' },
}

export default function IpInvestigation() {
  const { knownIps, connectionStatus } = useRealtime()
  const [query, setQuery]   = useState('')
  const [ip, setIp]         = useState('')
  const [filterType, setFilterType] = useState('')
  const [liveEvents, setLiveEvents] = useState(null)
  const [loading, setLoading] = useState(false)

  const activeKnownIps = useMemo(() => {
    return Array.from(new Set([...(knownIps || []), ...KNOWN_IPS]))
  }, [knownIps])

  useEffect(() => {
    if (!ip) {
      setLiveEvents(null)
      return
    }
    let cancel = false
    setLoading(true)
    fetch(`/api/ip-investigation?ip=${encodeURIComponent(ip)}`)
      .then((r) => { if (!r.ok) throw new Error('API erro'); return r.json() })
      .then((data) => {
        if (cancel) return
        if (data.events && data.events.length > 0) {
          setLiveEvents(data.events)
        } else {
          setLiveEvents(MOCK_IP_EVENTS[ip] || [])
        }
      })
      .catch(() => {
        if (!cancel) setLiveEvents(MOCK_IP_EVENTS[ip] || [])
      })
      .finally(() => { if (!cancel) setLoading(false) })

    return () => { cancel = true }
  }, [ip])

  const events = useMemo(() => {
    if (!ip) return []
    const raw = liveEvents !== null ? liveEvents : (MOCK_IP_EVENTS[ip] || [])
    const filtered = filterType ? raw.filter((e) => e.eventType === filterType) : raw
    return [...filtered].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
  }, [ip, liveEvents, filterType])

  const eventTypeCounts = useMemo(() => {
    if (!ip) return {}
    const raw = liveEvents !== null ? liveEvents : (MOCK_IP_EVENTS[ip] || [])
    return raw.reduce((acc, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc }, {})
  }, [ip, liveEvents])

  function handleSearch(e) {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) setIp(trimmed)
  }

  const suggestions = activeKnownIps.filter(
    (k) => k.includes(query) && k !== query && query.length > 0
  )

  return (
    <div className={styles.page}>
      <div className="page-header">
        <h1>Investigação de IP</h1>
        <p>
          Reconstrução cronológica de eventos por endereço IP
          {' — '}
          {connectionStatus === 'live' ? '🟢 Conectado ao MySQL (auth_logs)' : '⚠️ Modo mock'}
        </p>
      </div>

      {/* Search */}
      <form className={styles.searchForm} onSubmit={handleSearch}>
        <div className={styles.inputWrap}>
          <input
            className={`input-field ${styles.ipInput}`}
            type="text"
            placeholder="Digite um endereço IP (ex: 203.0.113.45)"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFilterType('') }}
            autoComplete="off"
            spellCheck={false}
          />
          {suggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {suggestions.map((s) => (
                <li key={s} onClick={() => { setQuery(s); setIp(s); setFilterType('') }}>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className="btn">🔍 Investigar</button>
      </form>

      {/* Known IPs hint */}
      {!ip && (
        <div className={styles.hintBox}>
          <span className={styles.hintTitle}>IPs sugeridos com eventos de auditoria detectados:</span>
          <div className={styles.hintChips}>
            {activeKnownIps.slice(0, 10).map((k) => (
              <button
                key={k}
                className={styles.chip}
                onClick={() => { setQuery(k); setIp(k); setFilterType('') }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {ip && (
        <>
          {/* IP summary */}
          <div className={`card ${styles.ipSummary}`}>
            <div className={styles.ipTitle}>
              <span className={styles.ipAddr}>{ip}</span>
              <span className={styles.ipTotal}>{events.length} evento(s) total {loading ? '(buscando…)' : ''}</span>
            </div>
            <div className={styles.countChips}>
              {Object.entries(eventTypeCounts).map(([type, count]) => {
                const meta = EVENT_META[type] || { label: type, color: 'var(--text-secondary)', icon: '❓' }
                return (
                  <button
                    key={type}
                    className={`${styles.typeChip} ${filterType === type ? styles.typeChipActive : ''}`}
                    style={{ '--chip-color': meta.color }}
                    onClick={() => setFilterType((f) => (f === type ? '' : type))}
                  >
                    {meta.icon} {meta.label} <strong>{count}</strong>
                  </button>
                )
              })}
              {filterType && (
                <button className={styles.clearFilter} onClick={() => setFilterType('')}>
                  ✕ Limpar filtro
                </button>
              )}
            </div>
          </div>

          {/* Timeline */}
          {events.length === 0 ? (
            <div className={styles.empty}>
              {MOCK_IP_EVENTS[ip] ? 'Nenhum evento corresponde ao filtro selecionado.' : `Nenhum evento encontrado para o IP "${ip}".`}
            </div>
          ) : (
            <div className={styles.timeline}>
              {events.map((ev, idx) => {
                const meta = EVENT_META[ev.eventType] || { label: ev.eventType, color: 'var(--text-secondary)', icon: '❓' }
                const ts   = new Date(ev.occurredAt)
                return (
                  <div key={ev.id} className={styles.timelineItem}>
                    {/* Line */}
                    <div className={styles.lineCol}>
                      <div className={styles.dot} style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
                      {idx < events.length - 1 && <div className={styles.line} />}
                    </div>

                    {/* Content */}
                    <div className={`card ${styles.eventCard}`}>
                      <div className={styles.eventHeader}>
                        <span className={styles.eventIcon}>{meta.icon}</span>
                        <span className={styles.eventType} style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className={styles.eventTs}>
                          {ts.toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className={styles.eventBody}>
                        <EventField icon="👤" label="Usuário"  value={ev.userId}  mono />
                        <EventField icon="🏪" label="Loja"     value={ev.storeId} />
                        <EventField icon="💬" label="Detalhe"  value={ev.detail} />
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* End marker */}
              <div className={styles.timelineEnd}>
                <span>Fim da timeline — {events.length} evento{events.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EventField({ icon, label, value, mono }) {
  return (
    <div className={styles.evField}>
      <span className={styles.evFieldIcon}>{icon}</span>
      <span className={styles.evFieldLabel}>{label}:</span>
      <span className={`${styles.evFieldValue} ${mono ? 'td-mono' : ''}`}>{value}</span>
    </div>
  )
}
