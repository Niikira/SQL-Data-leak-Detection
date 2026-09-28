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

from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_URL = "mysql+pymysql://root:1234@localhost:3306/banco_teste"
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


if __name__ == "__main__":
    app.run(port=5000, debug=True)
