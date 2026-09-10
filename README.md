# Detecção de Vazamento de Dados via SQL

## Sobre o Projeto
Este é um Produto Mínimo Viável (MVP) desenvolvido para a disciplina de Gestão Ágil de Projetos da Pontifícia Universidade Católica de São Paulo (PUC-SP). O sistema atua como um monitor de segurança corporativa para bancos de dados relacionais, focando na identificação de acessos suspeitos e na prevenção contra a exfiltração de dados sensíveis.

O projeto opera em duas frentes principais:
1. **Proteção de Dados (Prevenção):** Implementação de criptografia forte (AES-256-GCM) para dados confidenciais e hashes seguros (bcrypt) para senhas antes da persistência no banco.
2. **Monitoramento e Auditoria (Detecção):** Utilização de consultas SQL táticas (focadas em segurança defensiva / Blue Team) aplicadas sobre uma trilha de auditoria contínua para flagrar anomalias como ataques de força bruta, escalação de privilégios e acessos simultâneos irregulares.

## Equipe e Gestão Ágil (Scrum)
O desenvolvimento deste MVP foi guiado pelos princípios da metodologia ágil, com as entregas divididas em Sprints e a seguinte distribuição de papéis:

* **Nícolas Okamoto Celestrino:** Product Owner (PO) / Gerente do Projeto
* **Matheus Carvalho Reis:** Scrum Master
* **Gabriel Azevedo Cruz:** Desenvolvedor (UX Designer)
* **Gabriel Mechi Lima:** Desenvolvedor (Database Engineer)
* **Lucas Ferri:** Desenvolvedor (QA - Quality Assurance)

## Tecnologias Utilizadas
* **Python:** Criação dos roteiros de conexão, simulação de ataques e geração da massa de dados.
* **MySQL:** Banco de dados relacional para a estruturação das tabelas de auditoria e credenciais.
* **SQLAlchemy:** Biblioteca ORM para mapeamento das tabelas e bloqueio nativo contra SQL Injection (tratando inputs via *bind parameters*).
* **Cryptography (AES-GCM):** Biblioteca Python utilizada para a criptografia bidirecional exigida para os dados sensíveis.
