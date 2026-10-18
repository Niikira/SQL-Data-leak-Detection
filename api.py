"""
api.py — API REST e SSE (Server-Sent Events) para integração em tempo real
entre o banco MySQL (banco_teste) e o frontend (React/Vite).

Endpoints:
  GET  /api/health            -> Status da API e conexão com MySQL
  GET  /api/alerts            -> Lista atual de alertas de segurança
  GET  /api/dashboard         -> Resumo completo (contadores, gráficos por hora, tipos)
  GET  /api/locked-accounts   -> Usuários com lockout ativo no MySQL
  GET  /api/ip-investigation  -> IPs conhecidos e timeline cronológica de eventos
  GET  /api/measurements      -> Volume de medições por loja nas últimas 24h
  GET  /api/stream            -> Stream SSE para atualização em tempo real (push)
  POST /api/simulate-attack   -> Dispara simulação de ataque no banco para teste ao vivo
  POST /api/clean-data        -> Limpa registros de teste para reiniciar cenário
"""
import json
import os
import random
import time
from datetime import datetime, timezone, timedelta

from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from db_config import get_db_engine, get_db_session, get_db_url
from criarTabelas import Base, User, Store, AuthLog, Measurement

app = Flask(__name__)
CORS(app)

engine = get_db_engine()
Session = sessionmaker(bind=engine)

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


# ---------------------------------------------------------------------------
# Coleta de Alertas (Regras IDS/IPS de Detecção)
# ---------------------------------------------------------------------------
def coletar_alertas(session):
    global _next_id
    _next_id = 0
    alertas = []

    # 1. Movimentação lateral / exfiltração (mesmo usuário com 3+ IPs em 1h)
    try:
        rows = session.execute(text("""
            SELECT user_id, COUNT(DISTINCT ip_address) AS distinct_ips, MAX(occurred_at) AS ultimo
            FROM auth_logs
            WHERE event_type = 'login_success' AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
            GROUP BY user_id
            HAVING distinct_ips >= :t
        """), {"t": THRESHOLDS["EXFILTRACAO_IPS"]}).fetchall()
        for r in rows:
            # Busca nome do usuário se existir
            u = session.query(User).filter_by(id=r.user_id).first()
            alvo = u.username if u else f"User ID {r.user_id}"
            alertas.append({
                "id": novo_id(),
                "severity": "ALTA",
                "type": "LATERAL_MOVEMENT",
                "typeLabel": "Movimentação Lateral",
                "target": alvo,
                "details": f"Usuário logou de {r.distinct_ips} IPs distintos na última hora.",
                "timestamp": iso(r.ultimo),
            })
    except Exception as e:
        print("[api error] lateral_movement:", e)

    # 2. Força bruta / password spray (10+ falhas ou 5+ contas em 30 min)
    try:
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
                "id": novo_id(),
                "severity": "ALTA",
                "type": tipo,
                "typeLabel": label,
                "target": r.ip_address,
                "details": f"{r.fails} falhas de login em 30 min, visando {r.alvos} contas.",
                "timestamp": iso(r.ultimo),
            })
    except Exception as e:
        print("[api error] brute_force:", e)

    # 3. Exportação massiva de medições (50+ medições por loja em 24h)
    try:
        rows = session.execute(text("""
            SELECT s.name AS loja, m.store_id, COUNT(*) AS total, MAX(m.received_at) AS ultimo
            FROM measurements m JOIN stores s ON s.id = m.store_id
            WHERE m.received_at >= (NOW() - INTERVAL 24 HOUR)
            GROUP BY m.store_id, s.name
            HAVING total > :t
        """), {"t": THRESHOLDS["EXPORTACAO_MASSIVA_MEDICOES"]}).fetchall()
        for r in rows:
            alertas.append({
                "id": novo_id(),
                "severity": "ALTA",
                "type": "DATA_EXPORT",
                "typeLabel": "Exportação Massiva",
                "target": r.loja,
                "details": f"{r.total} medições recebidas nas últimas 24h (limite crítico: {THRESHOLDS['EXPORTACAO_MASSIVA_MEDICOES']}).",
                "timestamp": iso(r.ultimo),
            })
    except Exception as e:
        print("[api error] data_export:", e)

    # 4. Enumeração de tokens de lojas (8+ tokens inválidos em 1h)
    try:
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
                "id": novo_id(),
                "severity": "MÉDIA",
                "type": "TOKEN_ENUM",
                "typeLabel": "Enumeração de Tokens",
                "target": r.ip_address,
                "details": f"{r.tentativas} tokens inválidos testados em {r.lojas} lojas diferentes.",
                "timestamp": iso(r.ultimo),
            })
    except Exception as e:
        print("[api error] token_enum:", e)

    # 5. Contas bloqueadas (Lockout ativo)
    try:
        rows = session.execute(text("""
            SELECT username, failed_attempts, locked_until
            FROM users
            WHERE locked_until IS NOT NULL AND locked_until > NOW()
        """)).fetchall()
        for r in rows:
            alertas.append({
                "id": novo_id(),
                "severity": "MÉDIA",
                "type": "ACCOUNT_LOCKOUT",
                "typeLabel": "Bloqueio de Conta",
                "target": r.username,
                "details": f"Conta bloqueada após {r.failed_attempts} tentativas falhas. locked_until: {r.locked_until}.",
                "timestamp": iso(r.locked_until),
            })
    except Exception as e:
        print("[api error] lockout:", e)

    # 6. SQL Injection em campos de auditoria
    try:
        rows = session.execute(text("""
            SELECT ip_address, event_type, occurred_at
            FROM auth_logs
            WHERE ip_address REGEXP "('--|;|/\\\\*|union|select|drop|insert|update|delete)"
            ORDER BY occurred_at DESC
            LIMIT 10
        """)).fetchall()
        for r in rows:
            alertas.append({
                "id": novo_id(),
                "severity": "ALTA",
                "type": "SQL_INJECTION",
                "typeLabel": "SQL Injection",
                "target": r.ip_address,
                "details": f"Payload SQL malicioso detectado em evento {r.event_type}.",
                "timestamp": iso(r.occurred_at),
            })
    except Exception as e:
        print("[api error] sqli:", e)

    # 7. Escalação de privilégio (promoção para admin nas últimas 24h)
    try:
        rows = session.execute(text("""
            SELECT username, role, updated_at
            FROM users
            WHERE role = 'admin' AND updated_at >= (NOW() - INTERVAL 24 HOUR)
        """)).fetchall()
        for r in rows:
            alertas.append({
                "id": novo_id(),
                "severity": "MÉDIA",
                "type": "PRIV_ESCALATION",
                "typeLabel": "Escalação de Privilégio",
                "target": r.username,
                "details": f"Usuário promovido para perfil '{r.role}' recentemente.",
                "timestamp": iso(r.updated_at),
            })
    except Exception as e:
        print("[api error] priv_escalation:", e)

    # 8. Acessos fora do expediente (janela 00h às 05h)
    try:
        rows = session.execute(text("""
            SELECT u.username, l.ip_address, l.occurred_at
            FROM auth_logs l
            LEFT JOIN users u ON u.id = l.user_id
            WHERE l.event_type = 'login_success'
              AND HOUR(l.occurred_at) BETWEEN 0 AND 5
              AND l.occurred_at >= (NOW() - INTERVAL 24 HOUR)
            LIMIT 5
        """)).fetchall()
        for r in rows:
            target_name = r.username or r.ip_address or "Usuário Desconhecido"
            alertas.append({
                "id": novo_id(),
                "severity": "BAIXA",
                "type": "OFF_HOURS",
                "typeLabel": "Acesso Fora de Horário",
                "target": target_name,
                "details": f"Login efetuado durante janela noturna de risco (00h-05h). Origem: {r.ip_address}.",
                "timestamp": iso(r.occurred_at),
            })
    except Exception as e:
        print("[api error] off_hours:", e)

    alertas.sort(key=lambda a: a["timestamp"], reverse=True)
    return alertas


def coletar_estatisticas_dashboard(session):
    alertas = coletar_alertas(session)
    counts = {
        "ALTA": sum(1 for a in alertas if a["severity"] == "ALTA"),
        "MÉDIA": sum(1 for a in alertas if a["severity"] == "MÉDIA"),
        "BAIXA": sum(1 for a in alertas if a["severity"] == "BAIXA"),
        "total": len(alertas),
    }

    type_counts = {}
    for a in alertas:
        t = a["type"]
        type_counts[t] = type_counts.get(t, 0) + 1

    recent = alertas[:6]

    # Distribuição horária calculada a partir dos eventos reais de hoje
    hours_buckets = {}
    now_hour = datetime.now().hour
    # Gera últimas 7 horas
    for i in range(6, -1, -1):
        h = (now_hour - i) % 24
        label = f"{h:02d}:00"
        hours_buckets[label] = {"hour": label, "ALTA": 0, "MÉDIA": 0, "BAIXA": 0}

    for a in alertas:
        try:
            dt = datetime.fromisoformat(a["timestamp"].replace("Z", "+00:00"))
            hour_str = f"{dt.hour:02d}:00"
            if hour_str in hours_buckets:
                sev = a["severity"]
                if sev in hours_buckets[hour_str]:
                    hours_buckets[hour_str][sev] += 1
        except Exception:
            pass

    alerts_over_time = list(hours_buckets.values())

    return {
        "counts": counts,
        "typeCounts": type_counts,
        "recentAlerts": recent,
        "alertsOverTime": alerts_over_time,
        "totalAlerts": len(alertas),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Rotas REST
# ---------------------------------------------------------------------------
@app.route("/api/health")
def health():
    session = Session()
    db_ok = False
    try:
        session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    finally:
        session.close()

    return jsonify({
        "status": "online",
        "realtime": True,
        "db_connected": db_ok,
        "db_url": get_db_url().split("@")[-1],  # host/banco sem senha
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/api/alerts")
def get_alerts():
    session = Session()
    try:
        return jsonify(coletar_alertas(session))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/dashboard")
def get_dashboard():
    session = Session()
    try:
        return jsonify(coletar_estatisticas_dashboard(session))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/locked-accounts")
def get_locked_accounts():
    session = Session()
    try:
        users = session.query(User).filter(
            User.locked_until.isnot(None),
            User.locked_until > datetime.now()
        ).all()

        result = []
        for u in users:
            # Busca último IP com falha
            last_ip = "127.0.0.1"
            last_log = session.query(AuthLog).filter_by(user_id=u.id, event_type="login_fail") \
                .order_by(AuthLog.occurred_at.desc()).first()
            if last_log:
                last_ip = last_log.ip_address

            result.append({
                "id": f"u{u.id:02d}",
                "username": u.username,
                "role": u.role or "user",
                "failedAttempts": u.failed_attempts or 0,
                "lockedUntil": iso(u.locked_until),
                "lastFailedIp": last_ip,
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/ip-investigation")
def get_ip_investigation():
    ip_param = request.args.get("ip", "").strip()
    session = Session()
    try:
        # Lista todos os IPs distintos em auth_logs
        rows = session.execute(text("""
            SELECT DISTINCT ip_address FROM auth_logs WHERE ip_address IS NOT NULL AND ip_address != ''
            ORDER BY ip_address ASC
        """)).fetchall()
        known_ips = [r[0] for r in rows]

        events = []
        counts = {}
        if ip_param:
            logs = session.execute(text("""
                SELECT l.id, l.event_type, l.ip_address, l.occurred_at,
                       u.username, s.name as store_name
                FROM auth_logs l
                LEFT JOIN users u ON u.id = l.user_id
                LEFT JOIN stores s ON s.id = l.store_id
                WHERE l.ip_address = :ip
                ORDER BY l.occurred_at ASC
            """), {"ip": ip_param}).fetchall()

            for log in logs:
                event_type = log.event_type
                if event_type == "login_fail":
                    event_type = "login_failed"
                counts[event_type] = counts.get(event_type, 0) + 1

                events.append({
                    "id": f"e{log.id}",
                    "eventType": event_type,
                    "userId": log.username or f"User #{log.id}",
                    "storeId": log.store_name or "Geral",
                    "occurredAt": iso(log.occurred_at),
                    "detail": f"Evento {log.event_type} registrado via {log.ip_address}",
                })

        return jsonify({
            "knownIps": known_ips,
            "ip": ip_param,
            "events": events,
            "counts": counts,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/measurements")
def get_measurements():
    session = Session()
    try:
        # Busca todas as lojas e conta medições nas últimas 24h
        rows = session.execute(text("""
            SELECT s.name AS store, COUNT(m.id) AS measurements24h
            FROM stores s
            LEFT JOIN measurements m ON m.store_id = s.id AND m.received_at >= (NOW() - INTERVAL 24 HOUR)
            GROUP BY s.id, s.name
            ORDER BY measurements24h DESC
        """)).fetchall()

        result = []
        for r in rows:
            result.append({
                "store": r.store,
                "measurements24h": int(r.measurements24h),
                "baseline": 12,
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Server-Sent Events (SSE) para Atualizações em Real-Time
# ---------------------------------------------------------------------------
@app.route("/api/stream")
def sse_stream():
    """Canal contínuo de eventos SSE para o frontend atualizar em tempo real."""
    def event_stream():
        session = Session()
        try:
            while True:
                try:
                    data = coletar_estatisticas_dashboard(session)
                    json_data = json.dumps(data)
                    yield f"data: {json_data}\n\n"
                except Exception as err:
                    yield f": error {str(err)}\n\n"
                # Pulsa a cada 3 segundos
                time.sleep(3)
        finally:
            session.close()

    response = Response(stream_with_context(event_stream()), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    return response


# ---------------------------------------------------------------------------
# Endpoint de Simulação para Teste em Tempo Real direto pela UI
# ---------------------------------------------------------------------------
@app.route("/api/simulate-attack", methods=["POST"])
def simulate_attack():
    """Injeta um cenário de ataque com timestamps atuais para testar a detecção ao vivo."""
    payload = request.get_json(silent=True) or {}
    attack_type = payload.get("type", "all")

    session = Session()
    try:
        now_dt = datetime.now()

        # Garante usuário base
        user = session.query(User).filter_by(username="vitima_ataque").first()
        if not user:
            user = User(username="vitima_ataque", password_hash="$2b$12$falsoHashBcrypt", role="viewer")
            session.add(user)
            session.commit()

        # Garante loja base
        store = session.query(Store).filter_by(name="Loja Centro").first()
        if not store:
            store = Store(name="Loja Centro", api_key_hash="hash_api_key_falso")
            session.add(store)
            session.commit()

        executed = []

        if attack_type in ("brute_force", "all"):
            ip_bf = "198.51.100.23"
            for _ in range(12):
                session.add(AuthLog(user_id=user.id, store_id=store.id, event_type="login_fail",
                                    ip_address=ip_bf, occurred_at=now_dt - timedelta(minutes=random.randint(1, 15))))
            executed.append("Força Bruta")

        if attack_type in ("lateral_movement", "all"):
            ips = ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5"]
            for ip in ips:
                session.add(AuthLog(user_id=user.id, store_id=store.id, event_type="login_success",
                                    ip_address=ip, occurred_at=now_dt - timedelta(minutes=random.randint(1, 40))))
            executed.append("Movimentação Lateral")

        if attack_type in ("data_export", "all"):
            for _ in range(65):
                session.add(Measurement(
                    store_id=store.id,
                    download_mbps=random.randint(100, 800),
                    upload_mbps=random.randint(20, 200),
                    received_at=now_dt - timedelta(minutes=random.randint(5, 120))
                ))
            executed.append("Exportação Massiva (US06)")

        if attack_type in ("token_enum", "all"):
            ip_enum = "203.0.113.77"
            for _ in range(10):
                session.add(AuthLog(user_id=None, store_id=store.id, event_type="token_invalid",
                                    ip_address=ip_enum, occurred_at=now_dt - timedelta(minutes=random.randint(1, 45))))
            executed.append("Enumeração de Tokens")

        if attack_type in ("lockout", "all"):
            user.failed_attempts = 10
            user.locked_until = now_dt + timedelta(minutes=60)
            executed.append("Lockout de Conta")

        if attack_type in ("sql_injection", "all"):
            sqli_payloads = [
                "1' OR '1'='1'; --",
                "x' UNION SELECT username, password_hash FROM users --",
                "'; DROP TABLE users; --",
            ]
            for p in sqli_payloads:
                session.add(AuthLog(user_id=None, store_id=None, event_type="login_attempt",
                                    ip_address=p, occurred_at=now_dt - timedelta(minutes=random.randint(1, 20))))
            executed.append("SQL Injection")

        session.commit()

        # Retorna contagem atualizada imediatamente
        stats = coletar_estatisticas_dashboard(session)
        return jsonify({
            "success": True,
            "message": f"Ataques simulados com sucesso: {', '.join(executed)}",
            "executed": executed,
            "stats": stats,
        })
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/clean-data", methods=["POST"])
def clean_data():
    """Limpa tabelas de eventos e bloqueios para reiniciar a demonstração."""
    session = Session()
    try:
        session.execute(text("DELETE FROM auth_logs"))
        session.execute(text("DELETE FROM measurements"))
        session.execute(text("UPDATE users SET locked_until = NULL, failed_attempts = 0"))
        session.execute(text("UPDATE users SET role = 'viewer' WHERE username LIKE '%falso%' OR username LIKE '%pentest%'"))
        session.commit()
        return jsonify({"success": True, "message": "Logs, medições e bloqueios limpos com sucesso no MySQL."})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[*] API Flask iniciando em http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
