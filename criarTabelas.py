from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base

# Base declarativa do SQLAlchemy: todas as classes ORM herdam dela
# e são convertidas automaticamente em tabelas no banco de dados.
Base = declarative_base()

# Tabela de usuários: guarda credenciais, status de conta e dados sensíveis.
# Esses campos são usados para detectar lockout, acesso suspeito e escalada de privilégio.
class User(Base):
    __tablename__ = "users"

    # Identificador único do usuário.
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Nome de login; cada usuário deve ter um username único.
    username = Column(String(50), unique=True, nullable=False)

    # Senha armazenada como hash, nunca em texto claro.
    password_hash = Column(String(255), nullable=False)

    # Campo para simular dado sensível protegido por AES.
    dado_sensivel_aes = Column(String(255), nullable=True)

    # Chave TOTP para autenticação multifator, relevante para validações de segurança.
    totp_secret = Column(String(255), nullable=True)

    # Papel do usuário no sistema, como "viewer" ou "admin".
    role = Column(String(20), default="viewer")

    # Contador de falhas e prazo de bloqueio para proteção contra brute force.
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)

    # Datas de criação e atualização da conta.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Tabela de lojas: armazena cada loja/franquia e sua chave de API protegida.
# É usada para detectar tentativa de enumeração de agentes e exfiltração de dados.
class Store(Base):
    __tablename__ = "stores"

    # Identificador da loja.
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Nome da loja, obrigatório para identificação do registro.
    name = Column(String(100), nullable=False)

    # Hash da API key para evitar armazenamento em texto puro.
    api_key_hash = Column(String(255), nullable=False)

# Tabela de logs de autenticação: registra eventos como login, falha, token inválido etc.
# É o principal local para identificar atividades suspeitas por IP e por usuário.
class AuthLog(Base):
    __tablename__ = "auth_logs"

    # Identificador do evento de log.
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Usuário relacionado ao evento, quando houver associação direta.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Loja relacionada ao evento, útil para análise de acesso por agente/loja.
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)

    # Tipo do evento: login_success, login_fail, token_invalid, etc.
    event_type = Column(String(50), nullable=False)

    # Endereço IP da origem do evento, usado para detectar padrões maliciosos.
    ip_address = Column(String(45), nullable=False)

    # Momento em que o evento ocorreu.
    occurred_at = Column(DateTime, default=datetime.utcnow)

# Tabela de medições: cada registro representa uma leitura de desempenho da loja.
# Esse volume é relevante para detectar exfiltração ou picos anômalos de dados.
class Measurement(Base):
    __tablename__ = "measurements"

    # Identificador da medição.
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Loja à qual a medição pertence.
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)

    # Taxas de download e upload em Mbps.
    download_mbps = Column(Integer, nullable=False)
    upload_mbps = Column(Integer, nullable=False)

    # Data em que a medição foi recebida.
    received_at = Column(DateTime, default=datetime.utcnow)