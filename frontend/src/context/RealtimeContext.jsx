import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  MOCK_ALERTS,
  MOCK_ALERTS_OVER_TIME,
  MOCK_LOCKED_ACCOUNTS,
  MOCK_MEASUREMENTS,
  KNOWN_IPS,
} from '../data/mockData'

const RealtimeContext = createContext(null)

export function RealtimeProvider({ children }) {
  // Estado principal de dados
  const [alerts, setAlerts] = useState(MOCK_ALERTS)
  const [counts, setCounts] = useState({
    ALTA: MOCK_ALERTS.filter((a) => a.severity === 'ALTA').length,
    MÉDIA: MOCK_ALERTS.filter((a) => a.severity === 'MÉDIA').length,
    BAIXA: MOCK_ALERTS.filter((a) => a.severity === 'BAIXA').length,
    total: MOCK_ALERTS.length,
  })
  const [typeCounts, setTypeCounts] = useState(() => {
    const map = {}
    MOCK_ALERTS.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1 })
    return map
  })
  const [recentAlerts, setRecentAlerts] = useState(() =>
    [...MOCK_ALERTS].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6)
  )
  const [alertsOverTime, setAlertsOverTime] = useState(MOCK_ALERTS_OVER_TIME)
  const [lockedAccounts, setLockedAccounts] = useState(MOCK_LOCKED_ACCOUNTS)
  const [measurements, setMeasurements] = useState(MOCK_MEASUREMENTS)
  const [knownIps, setKnownIps] = useState(KNOWN_IPS)

  // Estado de conexão e streaming
  const [connectionStatus, setConnectionStatus] = useState('connecting') // 'live' | 'polling' | 'paused' | 'mock'
  const [lastSync, setLastSync] = useState(new Date())
  const [isPaused, setIsPaused] = useState(false)
  const [toast, setToast] = useState(null) // { type: 'alert' | 'success' | 'error', title, message }
  const [actionLoading, setActionLoading] = useState(false)

  const prevAlertsCountRef = useRef(alerts.length)
  const eventSourceRef = useRef(null)
  const pollingTimerRef = useRef(null)

  // Função para buscar dados completos via REST
  const fetchAllData = useCallback(async () => {
    try {
      const [dashRes, alertsRes, lockedRes, measRes, ipsRes] = await Promise.allSettled([
        fetch('/api/dashboard'),
        fetch('/api/alerts'),
        fetch('/api/locked-accounts'),
        fetch('/api/measurements'),
        fetch('/api/ip-investigation'),
      ])

      let isSuccess = false

      if (dashRes.status === 'fulfilled' && dashRes.value.ok) {
        const d = await dashRes.value.json()
        setCounts(d.counts)
        setTypeCounts(d.typeCounts)
        setRecentAlerts(d.recentAlerts)
        if (d.alertsOverTime && d.alertsOverTime.length > 0) {
          setAlertsOverTime(d.alertsOverTime)
        }
        isSuccess = true
      }

      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const a = await alertsRes.value.json()
        setAlerts(a)

        // Se houver novos alertas adicionados
        if (a.length > prevAlertsCountRef.current && prevAlertsCountRef.current > 0) {
          const newest = a[0]
          if (newest && newest.severity === 'ALTA') {
            setToast({
              type: 'alert',
              title: 'Novo alerta detectado em tempo real!',
              message: `[${newest.severity}] ${newest.typeLabel}: ${newest.target}`,
            })
          }
        }
        prevAlertsCountRef.current = a.length
        isSuccess = true
      }

      if (lockedRes.status === 'fulfilled' && lockedRes.value.ok) {
        const l = await lockedRes.value.json()
        setLockedAccounts(l)
        isSuccess = true
      }

      if (measRes.status === 'fulfilled' && measRes.value.ok) {
        const m = await measRes.value.json()
        if (m.length > 0) {
          setMeasurements(m)
        }
        isSuccess = true
      }

      if (ipsRes.status === 'fulfilled' && ipsRes.value.ok) {
        const ipData = await ipsRes.value.json()
        if (ipData.knownIps && ipData.knownIps.length > 0) {
          setKnownIps(ipData.knownIps)
        }
      }

      if (isSuccess) {
        setConnectionStatus('live')
        setLastSync(new Date())
      } else {
        setConnectionStatus('mock')
      }
    } catch {
      setConnectionStatus('mock')
    }
  }, [])

  // Configuração do EventSource (SSE em tempo real) + Polling Fallback
  useEffect(() => {
    if (isPaused) {
      setConnectionStatus('paused')
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
      return
    }

    // Busca inicial imediata
    fetchAllData()

    // Tenta conectar via SSE
    let es = null
    try {
      es = new EventSource('/api/stream')
      eventSourceRef.current = es

      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          if (d.counts) setCounts(d.counts)
          if (d.typeCounts) setTypeCounts(d.typeCounts)
          if (d.recentAlerts) setRecentAlerts(d.recentAlerts)
          if (d.alertsOverTime && d.alertsOverTime.length > 0) {
            setAlertsOverTime(d.alertsOverTime)
          }
          setConnectionStatus('live')
          setLastSync(new Date())

          // Atualiza contagem e verifica novos alertas
          if (d.totalAlerts && d.totalAlerts > prevAlertsCountRef.current && prevAlertsCountRef.current > 0) {
            if (d.recentAlerts && d.recentAlerts[0]?.severity === 'ALTA') {
              setToast({
                type: 'alert',
                title: 'Novo alerta detectado em tempo real!',
                message: `[${d.recentAlerts[0].severity}] ${d.recentAlerts[0].typeLabel}: ${d.recentAlerts[0].target}`,
              })
            }
            prevAlertsCountRef.current = d.totalAlerts
            // Re-busca lista completa para manter a tabela sincronizada
            fetch('/api/alerts')
              .then((r) => r.json())
              .then((a) => setAlerts(a))
              .catch(() => {})
          }
        } catch {
          // parse error
        }
      }

      es.onerror = () => {
        // SSE falhou ou desconectou temporariamente — ativa polling fallback
        setConnectionStatus((prev) => (prev === 'mock' ? 'mock' : 'polling'))
      }
    } catch {
      setConnectionStatus('polling')
    }

    // Polling contínuo como garantia e sincronização de dados secundários (a cada 4s)
    pollingTimerRef.current = setInterval(() => {
      fetchAllData()
    }, 4000)

    return () => {
      if (es) es.close()
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
    }
  }, [isPaused, fetchAllData])

  // Alterna pausa do tempo real
  const togglePause = useCallback(() => {
    setIsPaused((p) => !p)
  }, [])

  // Força atualização manual
  const refreshNow = useCallback(async () => {
    setActionLoading(true)
    await fetchAllData()
    setActionLoading(false)
  }, [fetchAllData])

  // Dispara simulação de ataque no MySQL
  const simulateAttack = useCallback(async (attackType = 'all') => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/simulate-attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: attackType }),
      })
      if (res.ok) {
        const data = await res.json()
        await fetchAllData()
        return data
      }
    } catch (e) {
      console.error('Falha ao simular ataque:', e)
    } finally {
      setActionLoading(false)
    }
  }, [fetchAllData])

  // Limpa registros de teste
  const cleanData = useCallback(async () => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/clean-data', { method: 'POST' })
      if (res.ok) {
        setAlerts([])
        setCounts({ ALTA: 0, MÉDIA: 0, BAIXA: 0, total: 0 })
        setTypeCounts({})
        setRecentAlerts([])
        setLockedAccounts([])
        prevAlertsCountRef.current = 0
        setToast({
          type: 'success',
          title: 'Logs limpos com sucesso!',
          message: 'As tabelas de logs de auditoria e medições foram zeradas no MySQL.',
        })
        await fetchAllData()
        return true
      }
    } catch (e) {
      console.error('Falha ao limpar dados:', e)
      setToast({
        type: 'error',
        title: 'Erro ao limpar logs',
        message: 'Não foi possível conectar ao backend.',
      })
    } finally {
      setActionLoading(false)
    }
    return false
  }, [fetchAllData])

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  const value = {
    alerts,
    counts,
    typeCounts,
    recentAlerts,
    alertsOverTime,
    lockedAccounts,
    measurements,
    knownIps,
    connectionStatus,
    lastSync,
    isPaused,
    actionLoading,
    toast,
    newAlertToast: toast,
    togglePause,
    refreshNow,
    simulateAttack,
    cleanData,
    dismissToast,
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) {
    throw new Error('useRealtime deve ser usado dentro de RealtimeProvider')
  }
  return ctx
}
