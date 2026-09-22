/**
 * MOCK DATA — replace each section's `fetch` calls with real REST endpoints.
 *
 * Endpoints hipotéticos esperados (a apontar depois):
 *  GET /api/alerts
 *  GET /api/locked-accounts
 *  GET /api/ip-timeline?ip=<addr>
 *  GET /api/measurements/24h
 */

// ─── Helpers ────────────────────────────────────────────────────────────────
const now = new Date('2026-09-22T14:00:00')
const ts = (offsetMinutes) =>
  new Date(now.getTime() - offsetMinutes * 60 * 1000).toISOString()

// ─── 1. ALERTS ──────────────────────────────────────────────────────────────
export const MOCK_ALERTS = [
  // Cenário 1 — Exfiltração / movimentação lateral
  {
    id: 'a01',
    severity: 'ALTA',
    type: 'LATERAL_MOVEMENT',
    typeLabel: 'Movimentação Lateral',
    target: 'vitima_ataque',
    details: 'Usuário logou de 4 IPs distintos em menos de 1h (192.168.1.10, 10.0.0.5, 172.16.3.22, 203.0.113.45)',
    timestamp: ts(12),
  },
  {
    id: 'a02',
    severity: 'ALTA',
    type: 'LATERAL_MOVEMENT',
    typeLabel: 'Movimentação Lateral',
    target: 'hacker_admin',
    details: 'Usuário logou de 3 IPs distintos em menos de 1h (10.10.1.1, 10.10.1.2, 10.10.1.99)',
    timestamp: ts(25),
  },

  // Cenário 2 — Força bruta / password spray
  {
    id: 'a03',
    severity: 'ALTA',
    type: 'BRUTE_FORCE',
    typeLabel: 'Força Bruta',
    target: '203.0.113.45',
    details: '14 falhas de login em 30 min contra contas: vitima_ataque, usuario_comum, admin_falso',
    timestamp: ts(18),
  },
  {
    id: 'a04',
    severity: 'ALTA',
    type: 'PASSWORD_SPRAY',
    typeLabel: 'Password Spray',
    target: '10.0.0.5',
    details: 'IP tentou 6 contas distintas com falha: admin, root, admin_falso, vitima_ataque, gerente01, suporte',
    timestamp: ts(35),
  },

  // Cenário 3 — Enumeração de agentes
  {
    id: 'a05',
    severity: 'MÉDIA',
    type: 'TOKEN_ENUM',
    typeLabel: 'Enumeração de Tokens',
    target: '172.16.3.22',
    details: '11 eventos token_invalid em 1h testando 4 lojas diferentes (Loja Centro, Loja Shopping, Loja Norte, Loja Sul)',
    timestamp: ts(45),
  },

  // Cenário 4 — Lockout (representado na tela de contas bloqueadas, mas alertado aqui)
  {
    id: 'a06',
    severity: 'MÉDIA',
    type: 'ACCOUNT_LOCKOUT',
    typeLabel: 'Bloqueio de Conta',
    target: 'vitima_ataque',
    details: 'Conta bloqueada após 10 tentativas falhas. locked_until: 2026-09-22T15:30:00Z',
    timestamp: ts(8),
  },
  {
    id: 'a07',
    severity: 'MÉDIA',
    type: 'ACCOUNT_LOCKOUT',
    typeLabel: 'Bloqueio de Conta',
    target: 'usuario_comum',
    details: 'Conta bloqueada após 10 tentativas falhas. locked_until: 2026-09-22T14:45:00Z',
    timestamp: ts(20),
  },

  // Cenário 5 — Exportação massiva
  {
    id: 'a08',
    severity: 'ALTA',
    type: 'DATA_EXPORT',
    typeLabel: 'Exportação Massiva',
    target: 'Loja Shopping',
    details: '78 medições recebidas nas últimas 24h (baseline: ~12/dia). Possível exfiltração de dados.',
    timestamp: ts(60),
  },
  {
    id: 'a09',
    severity: 'MÉDIA',
    type: 'DATA_EXPORT',
    typeLabel: 'Exportação Massiva',
    target: 'Loja Centro',
    details: '54 medições recebidas nas últimas 24h (baseline: ~12/dia).',
    timestamp: ts(90),
  },

  // Cenário 6 — Higiene de dados sensíveis
  {
    id: 'a10',
    severity: 'ALTA',
    type: 'WEAK_HASH',
    typeLabel: 'Hash Fraco',
    target: 'admin_falso',
    details: 'Hash de senha não segue padrão bcrypt ($2b$). Possível armazenamento em plaintext ou MD5.',
    timestamp: ts(200),
  },
  {
    id: 'a11',
    severity: 'MÉDIA',
    type: 'SHORT_TOTP',
    typeLabel: 'TOTP Curto',
    target: 'gerente01',
    details: 'totp_secret com apenas 8 caracteres — abaixo do mínimo recomendado (16). Possível dado não criptografado.',
    timestamp: ts(300),
  },

  // Cenário 7 — SQL Injection
  {
    id: 'a12',
    severity: 'ALTA',
    type: 'SQL_INJECTION',
    typeLabel: 'SQL Injection',
    target: '203.0.113.45',
    details: "Padrão suspeito detectado no campo username: admin'--; DROP TABLE users;--",
    timestamp: ts(5),
  },
  {
    id: 'a13',
    severity: 'ALTA',
    type: 'SQL_INJECTION',
    typeLabel: 'SQL Injection',
    target: '10.10.1.99',
    details: "Campo ip_address contém: ' UNION SELECT username, password FROM users--",
    timestamp: ts(9),
  },

  // Cenário 8 — Acesso fora de horário
  {
    id: 'a14',
    severity: 'BAIXA',
    type: 'OFF_HOURS',
    typeLabel: 'Acesso Fora de Horário',
    target: 'hacker_admin',
    details: 'Login bem-sucedido às 02:17 (janela de risco: 00h–05h) — IP: 10.10.1.1',
    timestamp: ts(720),
  },
  {
    id: 'a15',
    severity: 'BAIXA',
    type: 'OFF_HOURS',
    typeLabel: 'Acesso Fora de Horário',
    target: 'admin_falso',
    details: 'Login bem-sucedido às 03:44 (janela de risco: 00h–05h) — IP: 203.0.113.45',
    timestamp: ts(630),
  },

  // Cenário 9 — Escalação de privilégio
  {
    id: 'a16',
    severity: 'ALTA',
    type: 'PRIV_ESCALATION',
    typeLabel: 'Escalação de Privilégio',
    target: 'admin_falso',
    details: 'Role alterada para "admin" há 3h. Conta criada há apenas 2 dias.',
    timestamp: ts(180),
  },
  {
    id: 'a17',
    severity: 'ALTA',
    type: 'PRIV_ESCALATION',
    typeLabel: 'Escalação de Privilégio',
    target: 'hacker_admin',
    details: 'Role alterada para "admin" há 6h. updated_at diferente de created_at em < 24h.',
    timestamp: ts(360),
  },
]

// ─── 2. LOCKED ACCOUNTS ─────────────────────────────────────────────────────
export const MOCK_LOCKED_ACCOUNTS = [
  {
    id: 'u01',
    username: 'vitima_ataque',
    role: 'user',
    failedAttempts: 10,
    lockedUntil: new Date(now.getTime() + 90 * 60 * 1000).toISOString(), // +90 min
    lastFailedIp: '203.0.113.45',
  },
  {
    id: 'u02',
    username: 'usuario_comum',
    role: 'user',
    failedAttempts: 10,
    lockedUntil: new Date(now.getTime() + 45 * 60 * 1000).toISOString(), // +45 min
    lastFailedIp: '10.0.0.5',
  },
  {
    id: 'u03',
    username: 'gerente01',
    role: 'manager',
    failedAttempts: 7,
    lockedUntil: new Date(now.getTime() + 15 * 60 * 1000).toISOString(), // +15 min
    lastFailedIp: '172.16.3.22',
  },
  {
    id: 'u04',
    username: 'suporte',
    role: 'user',
    failedAttempts: 10,
    lockedUntil: new Date(now.getTime() + 120 * 60 * 1000).toISOString(), // +120 min
    lastFailedIp: '10.10.1.2',
  },
]

// ─── 3. IP TIMELINE (Cenário 10) ────────────────────────────────────────────
// Todos os eventos agrupados por IP — usado na tela de investigação
export const MOCK_IP_EVENTS = {
  '203.0.113.45': [
    { id: 'e01', eventType: 'login_failed',    userId: 'vitima_ataque', storeId: 'Loja Centro',   occurredAt: ts(40),  detail: 'Falha de login #1' },
    { id: 'e02', eventType: 'login_failed',    userId: 'usuario_comum', storeId: 'Loja Centro',   occurredAt: ts(38),  detail: 'Falha de login #2 (conta diferente)' },
    { id: 'e03', eventType: 'login_failed',    userId: 'admin_falso',   storeId: 'Loja Shopping', occurredAt: ts(36),  detail: "SQL Injection detectado: admin'--" },
    { id: 'e04', eventType: 'login_failed',    userId: 'vitima_ataque', storeId: 'Loja Shopping', occurredAt: ts(34),  detail: 'Falha #4' },
    { id: 'e05', eventType: 'login_failed',    userId: 'usuario_comum', storeId: 'Loja Norte',    occurredAt: ts(32),  detail: 'Falha #5' },
    { id: 'e06', eventType: 'login_failed',    userId: 'admin',         storeId: 'Loja Norte',    occurredAt: ts(30),  detail: 'Falha #6' },
    { id: 'e07', eventType: 'login_failed',    userId: 'root',          storeId: 'Loja Centro',   occurredAt: ts(28),  detail: 'Falha #7' },
    { id: 'e08', eventType: 'login_failed',    userId: 'gerente01',     storeId: 'Loja Sul',      occurredAt: ts(25),  detail: 'Falha #8' },
    { id: 'e09', eventType: 'login_failed',    userId: 'suporte',       storeId: 'Loja Sul',      occurredAt: ts(22),  detail: 'Falha #9 — lockout iminente' },
    { id: 'e10', eventType: 'login_success',   userId: 'admin_falso',   storeId: 'Loja Shopping', occurredAt: ts(18),  detail: 'Login bem-sucedido às 03:44 (fora de horário)' },
    { id: 'e11', eventType: 'token_invalid',   userId: 'admin_falso',   storeId: 'Loja Norte',    occurredAt: ts(12),  detail: 'Token inválido — possível enumeração' },
    { id: 'e12', eventType: 'login_failed',    userId: 'vitima_ataque', storeId: 'Loja Centro',   occurredAt: ts(6),   detail: 'Falha adicional — IP continua ativo' },
  ],
  '10.10.1.1': [
    { id: 'e20', eventType: 'login_success',   userId: 'hacker_admin',  storeId: 'Loja Centro',   occurredAt: ts(740), detail: 'Login às 02:17 (fora de horário)' },
    { id: 'e21', eventType: 'login_success',   userId: 'hacker_admin',  storeId: 'Loja Shopping', occurredAt: ts(730), detail: 'Segundo login — loja diferente' },
    { id: 'e22', eventType: 'token_invalid',   userId: 'hacker_admin',  storeId: 'Loja Norte',    occurredAt: ts(720), detail: 'Token inválido — Loja Norte' },
    { id: 'e23', eventType: 'token_invalid',   userId: 'hacker_admin',  storeId: 'Loja Sul',      occurredAt: ts(710), detail: 'Token inválido — Loja Sul' },
    { id: 'e24', eventType: 'priv_escalation', userId: 'hacker_admin',  storeId: 'Loja Centro',   occurredAt: ts(360), detail: 'Role alterada para "admin"' },
  ],
  '172.16.3.22': [
    { id: 'e30', eventType: 'token_invalid',   userId: 'vitima_ataque', storeId: 'Loja Centro',   occurredAt: ts(65),  detail: 'token_invalid #1' },
    { id: 'e31', eventType: 'token_invalid',   userId: 'vitima_ataque', storeId: 'Loja Shopping', occurredAt: ts(60),  detail: 'token_invalid #2' },
    { id: 'e32', eventType: 'token_invalid',   userId: 'vitima_ataque', storeId: 'Loja Norte',    occurredAt: ts(55),  detail: 'token_invalid #3' },
    { id: 'e33', eventType: 'token_invalid',   userId: 'vitima_ataque', storeId: 'Loja Sul',      occurredAt: ts(50),  detail: 'token_invalid #4 — enumeração de lojas' },
    { id: 'e34', eventType: 'login_failed',    userId: 'gerente01',     storeId: 'Loja Centro',   occurredAt: ts(45),  detail: 'Falha de login' },
    { id: 'e35', eventType: 'login_success',   userId: 'vitima_ataque', storeId: 'Loja Centro',   occurredAt: ts(30),  detail: 'Login bem-sucedido após tentativas' },
  ],
  '10.0.0.5': [
    { id: 'e40', eventType: 'login_failed',    userId: 'vitima_ataque', storeId: 'Loja Shopping', occurredAt: ts(55),  detail: 'Início do ataque de força bruta' },
    { id: 'e41', eventType: 'login_failed',    userId: 'usuario_comum', storeId: 'Loja Shopping', occurredAt: ts(52),  detail: 'Password spray — conta diferente' },
    { id: 'e42', eventType: 'login_failed',    userId: 'admin_falso',   storeId: 'Loja Shopping', occurredAt: ts(49),  detail: 'Password spray #3' },
    { id: 'e43', eventType: 'login_failed',    userId: 'gerente01',     storeId: 'Loja Shopping', occurredAt: ts(46),  detail: 'Password spray #4' },
    { id: 'e44', eventType: 'login_failed',    userId: 'suporte',       storeId: 'Loja Shopping', occurredAt: ts(43),  detail: 'Password spray #5' },
    { id: 'e45', eventType: 'login_failed',    userId: 'root',          storeId: 'Loja Norte',    occurredAt: ts(40),  detail: 'Password spray #6 — loja diferente' },
    { id: 'e46', eventType: 'login_success',   userId: 'vitima_ataque', storeId: 'Loja Shopping', occurredAt: ts(20),  detail: 'Login bem-sucedido — acesso confirmado' },
  ],
}

// IPs disponíveis para autocomplete
export const KNOWN_IPS = Object.keys(MOCK_IP_EVENTS)

// ─── 4. MEASUREMENTS (Cenário 5) ────────────────────────────────────────────
export const MOCK_MEASUREMENTS = [
  { store: 'Loja Centro',   measurements24h: 54, baseline: 12 },
  { store: 'Loja Shopping', measurements24h: 78, baseline: 12 },
  { store: 'Loja Norte',    measurements24h: 11, baseline: 12 },
  { store: 'Loja Sul',      measurements24h: 9,  baseline: 12 },
  { store: 'Loja Leste',    measurements24h: 14, baseline: 12 },
  { store: 'Loja Oeste',    measurements24h: 7,  baseline: 12 },
]

// ─── 5. ALERTS OVER TIME (para o gráfico do Dashboard) ──────────────────────
export const MOCK_ALERTS_OVER_TIME = [
  { hour: '08:00', ALTA: 0, MÉDIA: 0, BAIXA: 0 },
  { hour: '09:00', ALTA: 1, MÉDIA: 0, BAIXA: 0 },
  { hour: '10:00', ALTA: 0, MÉDIA: 1, BAIXA: 1 },
  { hour: '11:00', ALTA: 2, MÉDIA: 1, BAIXA: 0 },
  { hour: '12:00', ALTA: 1, MÉDIA: 2, BAIXA: 1 },
  { hour: '13:00', ALTA: 3, MÉDIA: 1, BAIXA: 0 },
  { hour: '14:00', ALTA: 4, MÉDIA: 2, BAIXA: 1 },
]
