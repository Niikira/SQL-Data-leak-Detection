import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Configuração da conexão com o banco MySQL usado para consultar os logs e usuários.
DB_URL = "mysql+pymysql://root:root@localhost:3306/banco_teste"
engine = create_engine(DB_URL)
Session = sessionmaker(bind=engine)

# Limiares (Thresholds) parametrizáveis de segurança 
THRESHOLDS = {
    "EXFILTRACAO_IPS": 3,               # Múltiplos IPs distintos por usuário em 1h
    "BRUTE_FORCE_FAILS": 10,            # Falhas de login por IP em 30 min
    "BRUTE_FORCE_USERS": 5,             # Usuários distintos alvos de spray por IP
    "EXPORTACAO_MASSIVA_MEDICOES": 50,  # Volume anômalo de medições por loja em 24h 
    "ENUMERACAO_TOKENS": 8,             # Tentativas de token inválido por IP em 1h
    "JANELA_HORAS_FORA_EXPEDIENTE": (0, 5) # Horário atípico de acesso (00h às 05h)
}

def imprimir_cabecalho(titulo):
    # Exibe um cabeçalho visual para separar os blocos de análise no terminal.
    print("\n" + "="*80)
    print(f" {titulo:^78} ")
    print("="*80)

def imprimir_alerta(severidade, tipo, usuario_ip, detalhes):
    # Define as cores usadas para destacar o nível de gravidade do alerta.
    cores = {
        "BAIXA": "\033[94m",  # Azul
        "MÉDIA": "\033[93m",  # Amarelo
        "ALTA": "\033[91m"    # Vermelho
    }
    reset = "\033[0m"
    cor = cores.get(severidade.upper(), reset)
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Mostra no console um alerta formatado com timestamp, tipo, origem/alvo e detalhes.
    print(f"{cor}[{severidade:^7}]{reset} {agora} | {tipo:<25} | Alvo/Origem: {usuario_ip:<15} | {detalhes}")

def analisar_exfiltracao_massa(session, threshold_ips=THRESHOLDS["EXFILTRACAO_IPS"]):
    # Detecta usuários que fizeram login com sucesso a partir de muitos IPs diferentes
    query = text("""
        SELECT user_id, COUNT(DISTINCT ip_address) AS distinct_ips, COUNT(*) AS total_events
        FROM auth_logs
        WHERE event_type = 'login_success' AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
        GROUP BY user_id
        HAVING distinct_ips >= :threshold
    """)
    resultados = session.execute(query, {"threshold": threshold_ips}).fetchall()
    for row in resultados:
        imprimir_alerta("ALTA", "Exfiltração/Movimentação", f"User ID {row.user_id}", f"Acessado de {row.distinct_ips} IPs distintos na última hora.")

def analisar_brute_force(session, threshold_fails=THRESHOLDS["BRUTE_FORCE_FAILS"], threshold_users=THRESHOLDS["BRUTE_FORCE_USERS"]):
    # Procura IPs que geraram muitas falhas de login em curto período (Força Bruta / Spray)
    query = text("""
        SELECT ip_address, SUM(event_type = 'login_fail') AS login_fails, COUNT(DISTINCT user_id) AS users_targeted
        FROM auth_logs
        WHERE occurred_at >= (NOW() - INTERVAL 30 MINUTE) AND event_type = 'login_fail'
        GROUP BY ip_address
        HAVING login_fails >= :t_fails OR users_targeted >= :t_users
    """)
    resultados = session.execute(query, {"t_fails": threshold_fails, "t_users": threshold_users}).fetchall()
    for row in resultados:
        imprimir_alerta("MÉDIA", "Força Bruta / Spray", row.ip_address, f"{row.login_fails} falhas, {row.users_targeted} usuários alvos.")

def analisar_exportacao_massiva_medicoes(session, threshold=THRESHOLDS["EXPORTACAO_MASSIVA_MEDICOES"]):
    # Sinaliza tentativas de exportação massiva/leitura fora do padrão por loja
    query = text("""
        SELECT s.name AS store_name, m.store_id, COUNT(*) AS total_medicoes
        FROM measurements m
        JOIN stores s ON s.id = m.store_id
        WHERE m.received_at >= (NOW() - INTERVAL 24 HOUR)
        GROUP BY m.store_id, s.name
        HAVING total_medicoes > :threshold
    """)
    resultados = session.execute(query, {"threshold": threshold}).fetchall()
    for row in resultados:
        imprimir_alerta("ALTA", "Exportação Massiva (US06)", f"Store ID {row.store_id} ({row.store_name})", f"{row.total_medicoes} medições solicitadas/enviadas (Limite: {threshold}).")

def analisar_enumeracao_agentes(session, threshold=THRESHOLDS["ENUMERACAO_TOKENS"]):
    # Detecta tentativas de adivinhar tokens/chaves de API de lojas ('token_invalid')
    query = text("""
        SELECT ip_address, COUNT(*) AS invalid_attempts, COUNT(DISTINCT store_id) AS stores_probed
        FROM auth_logs
        WHERE event_type = 'token_invalid' AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
        GROUP BY ip_address
        HAVING invalid_attempts >= :threshold
    """)
    resultados = session.execute(query, {"threshold": threshold}).fetchall()
    for row in resultados:
        imprimir_alerta("MÉDIA", "Enumeração de Agentes", row.ip_address, f"{row.invalid_attempts} tokens inválidos testados em {row.stores_probed} lojas.")

def analisar_contas_bloqueadas(session):
    # Lista usuários cujo lockout ainda está ativo.
    query = text("""
        SELECT username, failed_attempts, TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS minutes_remaining
        FROM users
        WHERE locked_until IS NOT NULL AND locked_until > NOW()
    """)
    resultados = session.execute(query).fetchall()
    for row in resultados:
        imprimir_alerta("ALTA", "Conta Bloqueada (Lockout)", row.username, f"{row.failed_attempts} falhas. Bloqueada por mais {row.minutes_remaining} mins.")

def analisar_sql_injection(session):
    # Busca registros de logs cujo campo de IP contém padrões típicos de payloads de SQL Injection.
    query = text("""
        SELECT ip_address, event_type
        FROM auth_logs
        WHERE ip_address REGEXP "('--|;|/\\\\*|union|select|drop|insert|update|delete)"
    """)
    resultados = session.execute(query).fetchall()
    for row in resultados:
        imprimir_alerta("ALTA", "Indício de SQL Injection", row.ip_address, f"Payload suspeito detectado em evento {row.event_type}.")

def analisar_escalacao_privilegio(session):
    # Detecta contas promovidas recentemente para a função de administrador.
    query = text("""
        SELECT username, role, updated_at
        FROM users
        WHERE role = 'admin' AND updated_at >= (NOW() - INTERVAL 24 HOUR)
    """)
    resultados = session.execute(query).fetchall()
    for row in resultados:
        imprimir_alerta("MÉDIA", "Escalação de Privilégio", row.username, f"Alterado para perfil '{row.role}' recentemente.")

def rodar_monitoramento():
    # Cria uma sessão do banco e executa todas as verificações em sequência.
    session = Session()
    try:
        imprimir_cabecalho("SISTEMA DE DETECÇÃO DE ANOMALIAS E VAZAMENTOS (IDS/IPS)")
        print("Iniciando varredura nos logs de auditoria e tabelas de sistema...\n")

        analisar_exfiltracao_massa(session)
        analisar_brute_force(session)
        analisar_exportacao_massiva_medicoes(session)
        analisar_enumeracao_agentes(session)
        analisar_contas_bloqueadas(session)
        analisar_sql_injection(session)
        analisar_escalacao_privilegio(session)
        
        print("\nVarredura concluída.")
    except Exception as e:
        print(f"Erro ao executar monitoramento: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    rodar_monitoramento()
