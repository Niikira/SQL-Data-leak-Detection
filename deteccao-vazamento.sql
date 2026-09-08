-- =============================================================================
-- DETECÇÃO DE VAZAMENTO DE DADOS VIA SQL — Franchise Network Monitor
-- =============================================================================
-- Schema alvo: stores, users, measurements, auth_logs (MySQL 8)
--
-- Estas queries são usadas pelo BLUE TEAM para detectar sinais de:
--   1. Exfiltração de dados em massa
--   2. Acesso anômalo a credenciais
--   3. Tentativas de brute-force / enumeração
--   4. Movimentação lateral e escalação de privilégio
--   5. Injeção de SQL (indícios nos logs de auth)
--
-- IMPORTANTE: Rode em ambiente com privilégio de leitura. Nunca em produção
-- sem revisão. Ajuste os thresholds conforme o baseline da sua operação.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1] EXFILTRAÇÃO EM MASSA — leituras anormalmente grandes de measurements
-- -----------------------------------------------------------------------------
-- Um atacante que comprometeu um JWT de usuário pode paginar /measurements
-- repetidamente para baixar todo o histórico. Detecta IPs que geraram muitos
-- eventos de sucesso seguidos de picos de acesso.
--
-- Sinal: mesmo user_id consultando de múltiplos IPs em janela curta.
SELECT
    user_id,
    COUNT(DISTINCT ip_address)              AS distinct_ips,
    COUNT(*)                                AS total_events,
    MIN(occurred_at)                        AS first_seen,
    MAX(occurred_at)                        AS last_seen
FROM auth_logs
WHERE event_type = 'login_success'
  AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
GROUP BY user_id
HAVING distinct_ips >= 3          -- mesmo usuário, 3+ IPs diferentes em 1h
ORDER BY distinct_ips DESC;


-- -----------------------------------------------------------------------------
-- [2] BRUTE-FORCE / PASSWORD SPRAY — falhas de login concentradas
-- -----------------------------------------------------------------------------
-- Detecta IPs com alto volume de login_fail / mfa_fail. Complementa o lockout
-- da aplicação (5 tentativas / 15 min) capturando ataques distribuídos por IP.
SELECT
    ip_address,
    SUM(event_type = 'login_fail')          AS login_fails,
    SUM(event_type = 'mfa_fail')            AS mfa_fails,
    COUNT(DISTINCT user_id)                 AS users_targeted,
    MIN(occurred_at)                        AS window_start,
    MAX(occurred_at)                        AS window_end
FROM auth_logs
WHERE occurred_at >= (NOW() - INTERVAL 30 MINUTE)
  AND event_type IN ('login_fail', 'mfa_fail')
GROUP BY ip_address
HAVING (login_fails + mfa_fails) >= 10      -- 10+ falhas em 30 min
    OR users_targeted >= 5                  -- ou tentando 5+ contas (spray)
ORDER BY (login_fails + mfa_fails) DESC;


-- -----------------------------------------------------------------------------
-- [3] ENUMERAÇÃO DE AGENTES — token_invalid repetido por IP
-- -----------------------------------------------------------------------------
-- Um atacante tentando adivinhar store_id + api_key gera muitos 'token_invalid'.
SELECT
    ip_address,
    COUNT(*)                                AS invalid_token_attempts,
    COUNT(DISTINCT store_id)                AS stores_probed,
    MAX(occurred_at)                        AS last_attempt
FROM auth_logs
WHERE event_type = 'token_invalid'
  AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
GROUP BY ip_address
HAVING invalid_token_attempts >= 8
ORDER BY invalid_token_attempts DESC;


-- -----------------------------------------------------------------------------
-- [4] CONTAS BLOQUEADAS — usuários sob ataque ativo
-- -----------------------------------------------------------------------------
-- Lista contas atualmente em lockout (indicador direto de ataque em andamento).
SELECT
    id                                      AS user_id,
    username,
    failed_attempts,
    locked_until,
    TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS minutes_remaining
FROM users
WHERE locked_until IS NOT NULL
  AND locked_until > NOW()
ORDER BY locked_until DESC;


-- -----------------------------------------------------------------------------
-- [5] EXFILTRAÇÃO DE MEDIÇÕES — volume anômalo por loja
-- -----------------------------------------------------------------------------
-- Uma loja saudável envia ~12 medições/dia (1 a cada 2h). Um pico enorme pode
-- indicar um agente comprometido reenviando dados falsos ou flooding.
SELECT
    store_id,
    COUNT(*)                                AS measurements_24h,
    ROUND(COUNT(*) / 12.0, 1)               AS x_normal_rate  -- 12 = baseline/dia
FROM measurements
WHERE received_at >= (NOW() - INTERVAL 24 HOUR)
GROUP BY store_id
HAVING measurements_24h > 50                -- >4x o esperado
ORDER BY measurements_24h DESC;


-- -----------------------------------------------------------------------------
-- [6] DADOS SENSÍVEIS EXPOSTOS — verificação de higiene do schema
-- -----------------------------------------------------------------------------
-- Confirma que colunas sensíveis NUNCA aparecem em texto claro. Um valor de
-- password_hash que NÃO comece com '$2b$' (bcrypt) indica hash fraco/vazado.
SELECT
    id AS user_id,
    username,
    CASE
        WHEN password_hash LIKE '$2b$%' THEN 'OK (bcrypt)'
        WHEN password_hash LIKE '$2a$%' THEN 'OK (bcrypt legado)'
        ELSE 'ALERTA: hash não-bcrypt — possível vazamento/downgrade'
    END AS password_hash_status,
    CASE
        WHEN CHAR_LENGTH(totp_secret) > 40 THEN 'OK (parece criptografado)'
        ELSE 'ALERTA: totp_secret curto — possível texto claro'
    END AS totp_secret_status
FROM users;


-- -----------------------------------------------------------------------------
-- [7] INDÍCIOS DE SQL INJECTION — padrões suspeitos em logs
-- -----------------------------------------------------------------------------
-- Embora a aplicação use ORM parametrizado (imune a SQLi), esta query varre
-- o audit log em busca de payloads que teriam sido tentados via campos livres.
-- (usar apenas se ip_address ou outros campos texto forem populados por input).
SELECT
    id,
    ip_address,
    event_type,
    occurred_at
FROM auth_logs
WHERE ip_address REGEXP "('|--|;|/\\*|union|select|drop|insert|update|delete|xp_)"
ORDER BY occurred_at DESC
LIMIT 100;


-- -----------------------------------------------------------------------------
-- [8] ACESSO FORA DE HORÁRIO — logins em janela atípica (00h–05h)
-- -----------------------------------------------------------------------------
-- Acesso administrativo de madrugada pode indicar credencial comprometida.
SELECT
    a.user_id,
    u.username,
    a.ip_address,
    a.occurred_at,
    HOUR(a.occurred_at) AS hora
FROM auth_logs a
JOIN users u ON u.id = a.user_id
WHERE a.event_type = 'login_success'
  AND HOUR(a.occurred_at) BETWEEN 0 AND 5
  AND a.occurred_at >= (NOW() - INTERVAL 7 DAY)
ORDER BY a.occurred_at DESC;


-- -----------------------------------------------------------------------------
-- [9] ESCALAÇÃO DE PRIVILÉGIO — mudanças recentes para role admin
-- -----------------------------------------------------------------------------
-- Detecta contas admin criadas/modificadas recentemente (janela de 24h).
SELECT
    id AS user_id,
    username,
    role,
    created_at,
    updated_at
FROM users
WHERE role = 'admin'
  AND updated_at >= (NOW() - INTERVAL 24 HOUR)
ORDER BY updated_at DESC;


-- -----------------------------------------------------------------------------
-- [10] TIMELINE DE INCIDENTE — reconstruir atividade de um IP suspeito
-- -----------------------------------------------------------------------------
-- Use durante a resposta a incidente. Substitua o IP pelo alvo investigado.
SELECT
    occurred_at,
    event_type,
    user_id,
    store_id,
    ip_address
FROM auth_logs
WHERE ip_address = '203.0.113.45'          -- <== substituir pelo IP investigado
ORDER BY occurred_at ASC;
