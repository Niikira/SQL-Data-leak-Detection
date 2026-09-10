# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine, inspect, text
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import sessionmaker
from criarTabelas import Base, User, AuthLog
from security import criptografar_dado
from datetime import datetime, timedelta

# Cria a conexão com o banco MySQL configurado localmente.
# O script assume que o banco 'banco_teste' já existe ou pode ser criado pelo MySQL.
engine = create_engine("mysql+pymysql://root:1234@localhost:3306/banco_teste")

# Garante que todas as tabelas definidas no modelo ORM existam no banco.
Base.metadata.create_all(engine)

# Verifica se a coluna 'totp_secret' já existe na tabela 'users'.
# Se não existir, adiciona a coluna dinamicamente para simular o cenário exigido pelas queries.
if "totp_secret" not in {column["name"] for column in inspect(engine).get_columns("users")}:
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE users ADD COLUMN totp_secret VARCHAR(255) NULL")
        )

# Cria uma sessão do SQLAlchemy para realizar inserções e consultas no banco.
Session = sessionmaker(bind=engine)
session = Session()

# 1. Inserir ou reutilizar um usuário falso com dado protegido por AES.
# Esse registro simula um usuário comprometido ou de interesse para análise de vazamento.
user1 = session.query(User).filter_by(username="admin_falso").first()
if user1 is None:
    user1 = User(
        username="admin_falso",
        password_hash="$2b$12$exemploHashBcryptFalsoAqui",
        dado_sensivel_aes=criptografar_dado("SEGREDO_SUPER_CONFIDENCIAL")
    )
    session.add(user1)
    session.commit()

# 2. Simular ataque de força bruta: vários eventos de login_fail vindos do mesmo IP.
# Isso ajuda a identificar qualquer comportamento de brute force em consultas de detecção.
for i in range(15):
    log_falso = AuthLog(
        user_id=user1.id,
        event_type="login_fail",
        ip_address="192.168.1.100"
    )
    session.add(log_falso)

# 3. Simular exfiltração: o mesmo usuário acessa a aplicação a partir de diversos IPs.
# Esse padrão é útil para descobrir acessos anômalos e movimentação lateral.
ips_suspeitos = ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]
for ip in ips_suspeitos:
    log_sucesso = AuthLog(
        user_id=user1.id,
        event_type="login_success",
        ip_address=ip
    )
    session.add(log_sucesso)

# 4. Criar uma conta que já esteja bloqueada pelos próximos 10 minutos.
# Esse registro simula uma vítima sob ataque ativo com lockout em andamento.
user2 = User(
    username="vitima_ataque",
    password_hash="$2b$12$hashfalsoaqui",
    failed_attempts=6,
    locked_until=datetime.utcnow() + timedelta(minutes=10)
)
session.add(user2)

# 5. Simular escalada de privilégio criando um usuário com role de administrador.
# Esse cenário é usado para detectar contas admin criadas ou alteradas recentemente.
user3 = User(
    username="hacker_admin",
    password_hash="$2b$12$hashfalsoaqui",
    role="admin",
    updated_at=datetime.utcnow()
)
session.add(user3)

# 6. Simular tentativa de SQL Injection nos logs: o campo de IP recebe um payload malicioso.
# Isso serve para testar a detecção de indícios de SQLi nos registros de autenticação.
log_sqli = AuthLog(
    user_id=user1.id,
    event_type="login_fail",
    ip_address="' OR '1'='1"
)
session.add(log_sqli)

# Persiste todas as alterações no banco.
session.commit()
print("Massa de dados gerada com sucesso!")