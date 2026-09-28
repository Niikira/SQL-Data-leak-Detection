from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from criarTabelas import Base, User, AuthLog, Store, Measurement
from security import criptografar_dado
from datetime import datetime, timedelta

# Cria a conexão com o banco MySQL configurado localmente.
engine = create_engine("mysql+pymysql://root:root@localhost:3306/banco_teste")
Base.metadata.create_all(engine)

if "totp_secret" not in {column["name"] for column in inspect(engine).get_columns("users")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN totp_secret VARCHAR(255) NULL"))

Session = sessionmaker(bind=engine)
session = Session()

# 1. Inserir ou reutilizar um usuário falso com dado protegido por AES.
user1 = session.query(User).filter_by(username="admin_falso").first()
if user1 is None:
    user1 = User(
        username="admin_falso",
        password_hash="$2b$12$exemploHashBcryptFalsoAqui",
        dado_sensivel_aes=criptografar_dado("SEGREDO_SUPER_CONFIDENCIAL")
    )
    session.add(user1)
    session.commit()

# 2. Simular ataque de força bruta
for i in range(15):
    session.add(AuthLog(user_id=user1.id, event_type="login_fail", ip_address="192.168.1.100"))

# 3. Simular exfiltração: acessos anômalos
ips_suspeitos = ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]
for ip in ips_suspeitos:
    session.add(AuthLog(user_id=user1.id, event_type="login_success", ip_address=ip))

# 4. Criar conta bloqueada
user2 = User(username="vitima_ataque", password_hash="$2b$12$hashfalsoaqui", failed_attempts=6, locked_until=datetime.now() + timedelta(minutes=10))
session.add(user2)

# 5. Simular escalada de privilégio
user3 = User(username="hacker_admin", password_hash="$2b$12$hashfalsoaqui", role="admin", updated_at=datetime.now())
session.add(user3)

# 6. Simular SQL Injection
session.add(AuthLog(user_id=user1.id, event_type="login_fail", ip_address="' OR '1'='1"))

# 7. Criar lojas e medições (US06)
store_normal = Store(name="Loja Centro", api_key_hash="hash_key_normal")
store_suspeita = Store(name="Loja Shopping", api_key_hash="hash_key_suspeita")
session.add(store_normal)
session.add(store_suspeita)
session.flush()

for _ in range(10):
    session.add(Measurement(store_id=store_normal.id, download_mbps=100, upload_mbps=50))
for _ in range(120):
    session.add(Measurement(store_id=store_suspeita.id, download_mbps=500, upload_mbps=200))

# 8. Simular enumeração de agentes
for _ in range(10):
    session.add(AuthLog(store_id=store_suspeita.id, event_type="token_invalid", ip_address="192.168.1.220"))

# 9. Simular usuário normal
user_normal = User(username="usuario_comum", password_hash="$2b$12$hashnormal", role="viewer")
session.add(user_normal)
session.flush()
session.add(AuthLog(user_id=user_normal.id, event_type="login_success", ip_address="200.100.50.1"))

# Persiste
session.commit()
print("Massa de dados gerada com sucesso! (Incluindo cenários normais vs. maliciosos)")