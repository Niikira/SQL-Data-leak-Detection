from sqlalchemy import create_engine
from criarTabelas import Base

print("Conectando ao banco de dados...")
from db_config import DB_URL
engine = create_engine(DB_URL)

print("Apagando tabelas antigas (resetando o banco)...")
Base.metadata.drop_all(engine)

print("Banco resetado com sucesso!")
