import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Configuração da conexão com o banco MySQL usado para consultar os logs e usuários.
DB_URL = "mysql+pymysql://root:1234@localhost:3306/banco_teste"
engine = create_engine(DB_URL)
Session = sessionmaker(bind=engine)

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

def analisar_exfiltracao_massa(session):
    # Detecta usuários que fizeram login com sucesso a partir de muitos IPs diferentes
    # em menos de uma hora, o que pode indicar movimentação anômala ou vazamento.
    query = text("""
        SELECT user_id, COUNT(DISTINCT ip_address) AS distinct_ips, COUNT(*) AS total_events
        FROM auth_logs
        WHERE event_type = 'login_success' AND occurred_at >= (NOW() - INTERVAL 1 HOUR)
        GROUP BY user_id
        HAVING distinct_ips >= 3
    """)
    resultados = session.execute(query).fetchall()
    for row in resultados:
        imprimir_alerta("ALTA", "Exfiltração/Movimentação", f"User ID {row.user_id}", f"Acessado de {row.distinct_ips} IPs distintos na última hora.")

def analisar_brute_force(session):
    # Procura IPs que geraram muitas falhas de login em curto período.
    # Isso pode sinalizar um ataque de força bruta ou spray de credenciais.
    query = text("""
        SELECT ip_address, SUM(event_type = 'login_fail') AS login_fails, COUNT(DISTINCT user_id) AS users_targeted
        FROM auth_logs
        WHERE occurred_at >= (NOW() - INTERVAL 30 MINUTE) AND event_type = 'login_fail'
        GROUP BY ip_address
        HAVING login_fails >= 10 OR users_targeted >= 5
    """)
    resultados = session.execute(query).fetchall()
    for row in resultados:
        imprimir_alerta("MÉDIA", "Força Bruta / Spray", row.ip_address, f"{row.login_fails} falhas, {row.users_targeted} usuários alvos.")

def analisar_contas_bloqueadas(session):
    # Lista usuários cujo lockout ainda está ativo.
    # Isso ajuda a visualizar contas temporariamente impedidas por excesso de tentativas falhas.
    query = text("""
        SELECT username, failed_attempts, TIMESTAMPDIFF(MINUTE, NOW(), locked_until) AS minutes_remaining
        FROM users
        WHERE locked_until IS NOT NULL AND locked_until > NOW()
    """)
    resultados = session.execute(query).fetchall()
    for row in resultados:
        imprimir_alerta("ALTA", "Conta Bloqueada (Lockout)", row.username, f"{row.failed_attempts} falhas. Bloqueada por mais {row.minutes_remaining} mins.")

def analisar_sql_injection(session):
    # Busca registros de logs cujo campo de IP contém padrões típicos de payloads
    # de SQL Injection. Isso é apenas uma checagem heurística de indicadores.
    query = text("""
        SELECT ip_address, event_type
        FROM auth_logs
        WHERE ip_address REGEXP "('--|;|/\\\\*|union|select|drop|insert|update|delete)"
    """)
    resultados = session.execute(query).fetchall()
    for row in resultados:
        imprimir_alerta("ALTA", "Indício de SQL Injection", row.ip_address, f"Payload suspeito detectado em evento {row.event_type}.")

def rodar_monitoramento():
    # Cria uma sessão do banco e executa todas as verificações em sequência.
    session = Session()
    try:
        imprimir_cabecalho("SISTEMA DE DETECÇÃO DE ANOMALIAS E VAZAMENTOS (IDS/IPS)")
        print("Iniciando varredura nos logs de auditoria...\n")

        # Cada função analisa um tipo diferente de comportamento suspeito.
        analisar_exfiltracao_massa(session)
        analisar_brute_force(session)
        analisar_contas_bloqueadas(session)
        analisar_sql_injection(session)
        
        print("\nVarredura concluída.")
    except Exception as e:
        # Captura qualquer erro durante a execução do monitoramento e mostra na tela.
        print(f"Erro ao executar monitoramento: {e}")
    finally:
        # Fecha a sessão para liberar recursos do banco.
        session.close()

if __name__ == "__main__":
    rodar_monitoramento()
