"""
api.py — API pequena que expõe os alertas de verdade (calculados a partir
do MySQL) para o frontend consumir, no lugar do mockData.js.

Reaproveita exatamente as mesmas regras/thresholds de monitoramento.py,
só que devolvendo JSON em vez de imprimir no terminal.

Endpoint:
  GET /api/alerts  -> [{ id, severity, type, typeLabel, target, details, timestamp }, ...]

Uso:
    pip install flask flask-cors
    python api.py
    (sobe em http://localhost:5000)
"""
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_URL = "mysql+pymysql://root:root@localhost:3306/banco_teste"
engine = create_engine(DB_URL)
Session = sessionmaker(bind=engine)

app = Flask(__name__)
CORS(app)

THRESHOLDS = {
    "EXFILTRACAO_IPS": 3,
    "BRUTE_FORCE_FAILS": 10,
    "BRUTE_FORCE_USERS": 5,
    "EXPORTACAO_MASSIVA_MEDICOES": 50,
    "ENUMERACAO_TOKENS": 8,
}

_next_id = 0


def novo_id():
    global _next_id
    _next_id += 1
    return f"a{_next_id:02d}"


def iso(dt):
    if dt is None:
        return datetime.now(timezone.utc).isoformat()
    return dt.replace(tzinfo=timezone.utc).isoformat() if dt.tzinfo is None else dt.isoformat()


def coletar_alertas(session):
    alertas = []

    # 1. Movimentação lateral / exfiltração
    rows = session.execute(text("""
        SELECT user_id, COUNT(DISTINCT ip_address) AS distinct_ips, MAX(occurred_at) AS ultimo
        FROM auth_logs
        WHERE event_type = 'login_success' AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
        GROUP BY user_id
        HAVING distinct_ips >= :t
    """), {"t": THRESHOLDS["EXFILTRACAO_IPS"]}).fetchall()
    for r in rows:
        alertas.append({
            "id": novo_id(), "severity": "ALTA", "type": "LATERAL_MOVEMENT",
            "typeLabel": "Movimentação Lateral", "target": f"User ID {r.user_id}",
            "details": f"Usuário logou de {r.distinct_ips} IPs distintos na última hora.",
            "timestamp": iso(r.ultimo),
        })

    # 2. Força bruta / password spray
    rows = session.execute(text("""
        SELECT ip_address, SUM(event_type = 'login_fail') AS fails,
               COUNT(DISTINCT user_id) AS alvos, MAX(occurred_at) AS ultimo
        FROM auth_logs
        WHERE occurred_at >= (NOW() - INTERVAL 30 MINUTE) AND event_type = 'login_fail'
        GROUP BY ip_address
        HAVING fails >= :tf OR alvos >= :tu
    """), {"tf": THRESHOLDS["BRUTE_FORCE_FAILS"], "tu": THRESHOLDS["BRUTE_FORCE_USERS"]}).fetchall()
    for r in rows:
        tipo = "PASSWORD_SPRAY" if r.alvos >= THRESHOLDS["BRUTE_FORCE_USERS"] else "BRUTE_FORCE"
        label = "Password Spray" if tipo == "PASSWORD_SPRAY" else "Força Bruta"
        alertas.append({
            "id": novo_id(), "severity": "ALTA", "type": tipo, "typeLabel": label,
            "target": r.ip_address,
            "details": f"{r.fails} falhas em 30 min, {r.alvos} usuários alvos.",
            "timestamp": iso(r.ultimo),
        })

    # 3. Exportação massiva
    rows = session.execute(text("""
        SELECT s.name AS loja, m.store_id, COUNT(*) AS total, MAX(m.received_at) AS ultimo
        FROM measurements m JOIN stores s ON s.id = m.store_id
        WHERE m.received_at >= (NOW() - INTERVAL 24 HOUR)
        GROUP BY m.store_id, s.name
        HAVING total > :t
    """), {"t": THRESHOLDS["EXPORTACAO_MASSIVA_MEDICOES"]}).fetchall()
    for r in rows:
        alertas.append({
            "id": novo_id(), "severity": "ALTA", "type": "DATA_EXPORT",
            "typeLabel": "Exportação Massiva", "target": r.loja,
            "details": f"{r.total} medições nas últimas 24h (limite: {THRESHOLDS['EXPORTACAO_MASSIVA_MEDICOES']}).",
            "timestamp": iso(r.ultimo),
        })

    # 4. Enumeração de tokens
    rows = session.execute(text("""
        SELECT ip_address, COUNT(*) AS tentativas, COUNT(DISTINCT store_id) AS lojas,
               MAX(occurred_at) AS ultimo
        FROM auth_logs
        WHERE event_type = 'token_invalid' AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
        GROUP BY ip_address
        HAVING tentativas >= :t
    """), {"t": THRESHOLDS["ENUMERACAO_TOKENS"]}).fetchall()
    for r in rows:
        alertas.append({
            "id": novo_id(), "severity": "MÉDIA", "type": "TOKEN_ENUM",
            "typeLabel": "Enumeração de Tokens", "target": r.ip_address,
            "details": f"{r.tentativas} tokens inválidos testados em {r.lojas} lojas.",
            "timestamp": iso(r.ultimo),
        })

    # 5. Contas bloqueadas
    rows = session.execute(text("""
        SELECT username, failed_attempts, locked_until
        FROM users
        WHERE locked_until IS NOT NULL AND locked_until > NOW()
    """)).fetchall()
    for r in rows:
        alertas.append({
            "id": novo_id(), "severity": "MÉDIA", "type": "ACCOUNT_LOCKOUT",
            "typeLabel": "Bloqueio de Conta", "target": r.username,
            "details": f"Conta bloqueada após {r.failed_attempts} tentativas falhas. locked_until: {r.locked_until}.",
            "timestamp": iso(None),
        })

    # 6. SQL Injection
    rows = session.execute(text("""
        SELECT ip_address, event_type, occurred_at
        FROM auth_logs
        WHERE ip_address REGEXP "('--|;|/\\\\*|union|select|drop|insert|update|delete)"
    """)).fetchall()
    for r in rows:
        alertas.append({
            "id": novo_id(), "severity": "ALTA", "type": "SQL_INJECTION",
            "typeLabel": "SQL Injection", "target": r.ip_address,
            "details": f"Payload suspeito detectado em evento {r.event_type}.",
            "timestamp": iso(r.occurred_at),
        })

    # 7. Escalação de privilégio
    rows = session.execute(text("""
        SELECT username, role, updated_at
        FROM users
        WHERE role = 'admin' AND updated_at >= (NOW() - INTERVAL 24 HOUR)
    """)).fetchall()
    for r in rows:
        alertas.append({
            "id": novo_id(), "severity": "MÉDIA", "type": "PRIV_ESCALATION",
            "typeLabel": "Escalação de Privilégio", "target": r.username,
            "details": f"Alterado para perfil '{r.role}' recentemente.",
            "timestamp": iso(r.updated_at),
        })

    alertas.sort(key=lambda a: a["timestamp"], reverse=True)
    return alertas


@app.route("/api/alerts")
def get_alerts():
    global _next_id
    _next_id = 0
    session = Session()
    try:
        return jsonify(coletar_alertas(session))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/pentest", methods=["POST"])
def run_pentest():
    """Injeta os padrões de ataque do pentest.py no banco e devolve os alertas
    que a detecção pegou logo em seguida. É o "Rodar Pentest" do dashboard:
    o front chama isto e mostra quantos ataques foram detectados.

    Body JSON opcional: {"clean": true} limpa auth_logs/measurements antes,
    para uma rodada isolada (senão os ataques acumulam com os dados anteriores).
    """
    global _next_id
    _next_id = 0

    # pentest.py traz as mesmas rotinas de ataque usadas no terminal.
    import pentest

    body = request.get_json(silent=True) or {}
    limpar = bool(body.get("clean"))

    ataques = [
        ("Movimentação Lateral", pentest.attack_movimentacao_lateral),
        ("Força Bruta / Spray", pentest.attack_forca_bruta),
        ("Exportação Massiva", pentest.attack_exportacao_massiva),
        ("Enumeração de Tokens", pentest.attack_enumeracao_tokens),
        ("Bloqueio de Conta", pentest.attack_lockout),
        ("SQL Injection", pentest.attack_sql_injection),
        ("Escalação de Privilégio", pentest.attack_escalacao_privilegio),
    ]

    inj_session = pentest.Session()
    try:
        if limpar:
            pentest.clean_run_data(inj_session)
        for _, fn in ataques:
            fn(inj_session)
        inj_session.commit()
    except Exception as e:
        inj_session.rollback()
        return jsonify({"error": f"falha ao injetar ataques: {e}"}), 500
    finally:
        inj_session.close()

    session = Session()
    try:
        alertas = coletar_alertas(session)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

    return jsonify({
        "injected": [nome for nome, _ in ataques],
        "injectedCount": len(ataques),
        "detectedCount": len(alertas),
        "cleaned": limpar,
        "alerts": alertas,
    })


@app.route("/api/reset", methods=["POST"])
def reset_panel():
    """Zera o painel: limpa os logs/medições e tira usuários das janelas de
    detecção (lockout e escalação), sem apagar usuários nem trocar papéis.
    Deixa as 7 regras retornando zero — ponto de partida limpo para a demo.
    """
    session = Session()
    try:
        session.execute(text("DELETE FROM auth_logs"))
        session.execute(text("DELETE FROM measurements"))
        session.execute(text("UPDATE users SET locked_until = NULL, failed_attempts = 0"))
        # Joga o updated_at dos admins para fora da janela de 24h da escalação.
        session.execute(text("UPDATE users SET updated_at = (NOW() - INTERVAL 2 DAY) WHERE role = 'admin'"))
        session.commit()
    except Exception as e:
        session.rollback()
        return jsonify({"error": f"falha ao zerar: {e}"}), 500
    finally:
        session.close()
    return jsonify({"ok": True, "detectedCount": 0, "alerts": []})


@app.route("/api/locked-accounts")
def get_locked_accounts():
    """Contas com lockout ativo (locked_until no futuro), com o último IP que
    falhou login para cada uma."""
    session = Session()
    try:
        rows = session.execute(text("""
            SELECT u.id, u.username, u.role, u.failed_attempts, u.locked_until,
                   (SELECT a.ip_address FROM auth_logs a
                     WHERE a.user_id = u.id AND a.event_type = 'login_fail'
                     ORDER BY a.occurred_at DESC LIMIT 1) AS last_ip
            FROM users u
            WHERE u.locked_until IS NOT NULL AND u.locked_until > NOW()
            ORDER BY u.locked_until DESC
        """)).fetchall()
        return jsonify([{
            "id": f"u{r.id}",
            "username": r.username,
            "role": r.role or "viewer",
            "failedAttempts": r.failed_attempts or 0,
            "lockedUntil": iso(r.locked_until),
            "lastFailedIp": r.last_ip or "—",
        } for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/known-ips")
def get_known_ips():
    """IPs que aparecem nos logs de auditoria (para busca/sugestão)."""
    session = Session()
    try:
        rows = session.execute(text("""
            SELECT ip_address, COUNT(*) AS c
            FROM auth_logs
            GROUP BY ip_address
            ORDER BY c DESC
            LIMIT 50
        """)).fetchall()
        return jsonify([r.ip_address for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


_EVENT_DETALHE = {
    "login_success": "Login bem-sucedido",
    "login_fail": "Falha de login",
    "token_invalid": "Token/API key inválido — possível enumeração",
    "login_attempt": "Tentativa de login (payload suspeito no campo IP)",
}


@app.route("/api/ip-events")
def get_ip_events():
    """Linha do tempo de eventos de um IP (tela Investigar IP)."""
    ip = request.args.get("ip", "").strip()
    if not ip:
        return jsonify([])
    session = Session()
    try:
        rows = session.execute(text("""
            SELECT a.id, a.event_type, a.occurred_at,
                   u.username AS username, s.name AS store_name
            FROM auth_logs a
            LEFT JOIN users u ON u.id = a.user_id
            LEFT JOIN stores s ON s.id = a.store_id
            WHERE a.ip_address = :ip
            ORDER BY a.occurred_at
        """), {"ip": ip}).fetchall()
        return jsonify([{
            "id": f"e{r.id}",
            "eventType": r.event_type,
            "userId": r.username or "—",
            "storeId": r.store_name or "—",
            "occurredAt": iso(r.occurred_at),
            "detail": _EVENT_DETALHE.get(r.event_type, r.event_type),
        } for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/measurements")
def get_measurements():
    """Volume de medições por loja nas últimas 24h (tela Medições/Exportação)."""
    session = Session()
    try:
        rows = session.execute(text("""
            SELECT s.name AS store, COUNT(*) AS total
            FROM measurements m JOIN stores s ON s.id = m.store_id
            WHERE m.received_at >= (NOW() - INTERVAL 24 HOUR)
            GROUP BY m.store_id, s.name
            ORDER BY total DESC
        """)).fetchall()
        return jsonify([{
            "store": r.store,
            "measurements24h": r.total,
            "baseline": 12,
        } for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


if __name__ == "__main__":
    # use_reloader=False: um processo só, encerra limpo quando o start.py para tudo.
    app.run(port=5000, debug=True, use_reloader=False)
