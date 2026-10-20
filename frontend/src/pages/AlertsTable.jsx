import React, { useState, useEffect, useMemo } from 'react'
import styles from './AlertsTable.module.css'

const SEV_ORDER = { ALTA: 0, MÉDIA: 1, BAIXA: 2 }

const ALL_TYPES = [
  { key: '',               label: 'Todos os tipos' },
  { key: 'LATERAL_MOVEMENT', label: 'Movimentação Lateral' },
  { key: 'BRUTE_FORCE',      label: 'Força Bruta' },
  { key: 'PASSWORD_SPRAY',   label: 'Password Spray' },
  { key: 'TOKEN_ENUM',       label: 'Enumeração de Tokens' },
  { key: 'ACCOUNT_LOCKOUT',  label: 'Bloqueio de Conta' },
  { key: 'DATA_EXPORT',      label: 'Exportação Massiva' },
  { key: 'WEAK_HASH',        label: 'Hash Fraco' },
  { key: 'SHORT_TOTP',       label: 'TOTP Curto' },
  { key: 'SQL_INJECTION',    label: 'SQL Injection' },
  { key: 'OFF_HOURS',        label: 'Acesso Fora de Horário' },
  { key: 'PRIV_ESCALATION',  label: 'Escalação de Privilégio' },
]

export default function AlertsTable() {
  const [sevFilter, setSevFilter]   = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState('timestamp')
  const [sortDir, setSortDir]       = useState('desc')

  const [alerts, setAlerts]   = useState([])
  const [isMock, setIsMock]   = useState(false)
  const [loading, setLoading] = useState(true)

  // Estado do "Rodar Pentest": se está rodando e o resultado da última rodada.
  const [pentesting, setPentesting]       = useState(false)
  const [pentestResult, setPentestResult] = useState(null)

  function loadAlerts() {
    setLoading(true)
    return fetch('/api/alerts')
      .then((r) => { if (!r.ok) throw new Error('API respondeu ' + r.status); return r.json() })
      .then((data) => {
        setAlerts(data)
        setIsMock(false)
        return data
      })
      .catch(() => {
        // API fora do ar: mantém os dados mockados para a tela não ficar vazia.
        setIsMock(true)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAlerts() }, [])

  function runPentest(clean) {
    if (pentesting) return
    setPentesting(true)
    setPentestResult(null)
    fetch('/api/pentest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clean: !!clean }),
    })
      .then(async (r) => {
        const txt = await r.text()
        if (!r.ok || !txt.trim()) throw new Error('API-OFFLINE')
        let j
        try { j = JSON.parse(txt) } catch { throw new Error('API-OFFLINE') }
        if (j.error) throw new Error(j.error)
        return j
      })
      .then((res) => {
        setAlerts(res.alerts)
        setIsMock(false)
        setPentestResult({ ok: true, ...res })
      })
      .catch((e) => {
        const m = String(e.message || e)
        const amigavel = (m === 'API-OFFLINE' || m.includes('Failed to fetch') || m.includes('JSON'))
          ? 'Não consegui falar com a API. Confira se o MySQL está ligado (usuário root, senha root) e reinicie pelo iniciar.bat.'
          : m
        setPentestResult({ ok: false, error: amigavel })
      })
      .finally(() => setPentesting(false))
  }

  const filtered = useMemo(() => {
    let data = [...alerts]
    if (sevFilter)  data = data.filter((a) => a.severity === sevFilter)
    if (typeFilter) data = data.filter((a) => a.type === typeFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter(
        (a) =>
          a.target.toLowerCase().includes(q) ||
          a.details.toLowerCase().includes(q) ||
          a.typeLabel.toLowerCase().includes(q)
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

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function sortIcon(key) {
    if (sortKey !== key) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className={styles.page}>
      <div className="page-header">
        <h1>Tabela de Alertas</h1>
        <p>
          {filtered.length} alerta{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          {' — '}
          {loading ? 'carregando…' : isMock ? '⚠️ API indisponível (sem dados)' : '🟢 dados reais (api/alerts)'}
        </p>
      </div>

      {/* Pentest: injeta ataques no banco e mostra o que a detecção pegou */}
      <div className={styles.pentestBar}>
        <div>
          <strong>Simular ataque (pentest)</strong>
          <span className={styles.pentestHint}>
            {' '}injeta os 7 padrões de ataque no banco e recarrega os alertas detectados.
          </span>
        </div>
        <div className={styles.pentestBtns}>
          <button className="btn" onClick={() => runPentest(false)} disabled={pentesting}>
            {pentesting ? '⏳ Rodando…' : '🔴 Rodar Pentest'}
          </button>
          <button className="btn" onClick={() => runPentest(true)} disabled={pentesting} title="Limpa logs/medições antes de atacar">
            🧹 Pentest (rodada limpa)
          </button>
          <button className="btn" onClick={loadAlerts} disabled={pentesting || loading}>
            🔄 Atualizar
          </button>
        </div>
      </div>

      {pentestResult && (
        <div className={`${styles.pentestResult} ${pentestResult.ok ? styles.resultOk : styles.resultErr}`}>
          {pentestResult.ok ? (
            <>
              <strong>
                ✅ {pentestResult.injectedCount} ataques injetados — {pentestResult.detectedCount} alerta
                {pentestResult.detectedCount !== 1 ? 's' : ''} detectado{pentestResult.detectedCount !== 1 ? 's' : ''}
                {pentestResult.cleaned ? ' (rodada limpa)' : ''}.
              </strong>
              <span className={styles.pentestHint}> A detecção funcionou: os padrões abaixo foram capturados.</span>
            </>
          ) : (
            <strong>⚠️ Falha ao rodar o pentest: {pentestResult.error}</strong>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="ctrl-row">
        <input
          className="input-field"
          type="text"
          placeholder="Buscar por alvo, detalhes ou tipo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select-field" value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
          <option value="">Todas as severidades</option>
          <option value="ALTA">🔴 ALTA</option>
          <option value="MÉDIA">🟡 MÉDIA</option>
          <option value="BAIXA">🔵 BAIXA</option>
        </select>
        <select className="select-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {ALL_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        {(sevFilter || typeFilter || search) && (
          <button className="btn" onClick={() => { setSevFilter(''); setTypeFilter(''); setSearch('') }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('severity')}>
                  Severidade{sortIcon('severity')}
                </th>
                <th>Tipo</th>
                <th>Alvo / Origem</th>
                <th>Detalhes</th>
                <th className="sortable" onClick={() => handleSort('timestamp')}>
                  Timestamp{sortIcon('timestamp')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    Nenhum alerta encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`badge badge-${a.severity}`}>{a.severity}</span></td>
                    <td>
                      <span className={`${styles.typeTag} ${styles[`type_${a.type}`]}`}>
                        {typeIcon(a.type)} {a.typeLabel}
                      </span>
                    </td>
                    <td className="td-mono">{a.target}</td>
                    <td className={styles.detailCell}>{a.details}</td>
                    <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(a.timestamp).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </td>
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

function typeIcon(type) {
  const map = {
    LATERAL_MOVEMENT: '🔀',
    BRUTE_FORCE:      '💥',
    PASSWORD_SPRAY:   '🌊',
    TOKEN_ENUM:       '🔑',
    ACCOUNT_LOCKOUT:  '🔒',
    DATA_EXPORT:      '📤',
    WEAK_HASH:        '⚠️',
    SHORT_TOTP:       '🔐',
    SQL_INJECTION:    '💉',
    OFF_HOURS:        '🌙',
    PRIV_ESCALATION:  '⬆️',
  }
  return map[type] ?? '❓'
}
