from sqlalchemy import create_engine
from criarTabelas import Base

print("Conectando ao banco de dados...")
engine = create_engine("mysql+pymysql://root:root@localhost:3306/banco_teste")

print("Apagando tabelas antigas (resetando o banco)...")
Base.metadata.drop_all(engine)

print("Banco resetado com sucesso!")
