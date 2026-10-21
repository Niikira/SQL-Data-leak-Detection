// Metadados compartilhados entre as telas: rótulo e ícone de cada técnica de
// ataque, cores de severidade e formatação de datas.

export const ALERT_TYPE_META = {
  LATERAL_MOVEMENT: { label: 'Movimentação lateral',     icon: 'shuffle' },
  BRUTE_FORCE:      { label: 'Força bruta',              icon: 'target' },
  PASSWORD_SPRAY:   { label: 'Password spray',           icon: 'wind' },
  TOKEN_ENUM:       { label: 'Enumeração de tokens',     icon: 'key' },
  ACCOUNT_LOCKOUT:  { label: 'Bloqueio de conta',        icon: 'lock' },
  DATA_EXPORT:      { label: 'Exportação massiva',       icon: 'upload' },
  WEAK_HASH:        { label: 'Hash fraco',               icon: 'hash' },
  SHORT_TOTP:       { label: 'TOTP curto',               icon: 'timer' },
  SQL_INJECTION:    { label: 'SQL injection',            icon: 'code' },
  OFF_HOURS:        { label: 'Acesso fora de horário',   icon: 'moon' },
  PRIV_ESCALATION:  { label: 'Escalação de privilégio',  icon: 'trendUp' },
}

export function typeMeta(type, fallbackLabel) {
  return ALERT_TYPE_META[type] || { label: fallbackLabel || type, icon: 'alert' }
}

export const SEV_COLOR = {
  ALTA:  'var(--sev-high)',
  MÉDIA: 'var(--sev-med)',
  BAIXA: 'var(--sev-low)',
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
