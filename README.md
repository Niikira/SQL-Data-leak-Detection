# Detecção de Vazamento de Dados via SQL

## Sobre o Projeto

Este é um Produto Mínimo Viável (MVP) desenvolvido para a disciplina de Gestão Ágil de Projetos da Pontifícia Universidade Católica de São Paulo (PUC-SP). O sistema atua como um monitor de segurança corporativa para bancos de dados relacionais, focando na identificação de acessos suspeitos e na prevenção contra a exfiltração de dados sensíveis.

O projeto opera em três frentes:

1. **Proteção de Dados (Prevenção):** criptografia forte (AES-256-GCM) para dados confidenciais e hashes seguros (bcrypt) para senhas antes da persistência no banco.
2. **Monitoramento e Auditoria (Detecção):** consultas SQL táticas (segurança defensiva / Blue Team) aplicadas sobre uma trilha de auditoria contínua para flagrar anomalias como ataques de força bruta, escalação de privilégios, exportação massiva de dados e acessos simultâneos irregulares.
3. **Visualização (Dashboard):** interface web que exibe os alertas gerados pela detecção, com filtros por severidade, tipo e busca — e um botão para **simular um ataque (pentest)** e ver a detecção reagir ao vivo.

Os padrões de ataque que o sistema sabe detectar hoje:

| Padrão | Severidade | O que dispara o alerta |
|---|---|---|
| Movimentação Lateral / Exfiltração | ALTA | Mesmo usuário logando de 3+ IPs distintos em 1h |
| Força Bruta / Password Spray | ALTA | 10+ falhas de login ou 5+ contas alvo por IP em 30min |
| Exportação Massiva | ALTA | Mais de 50 medições recebidas por uma loja em 24h |
| Enumeração de Tokens | MÉDIA | 8+ tentativas de token inválido por IP em 1h, testando várias lojas |
| Bloqueio de Conta | MÉDIA | Conta com `locked_until` ainda no futuro |
| SQL Injection | ALTA | Payloads suspeitos (`union`, `select`, `drop`, `--`, `;`) em campos de log |
| Escalação de Privilégio | MÉDIA | Usuário promovido a `admin` nas últimas 24h |

## Equipe e Gestão Ágil (Scrum)

O desenvolvimento deste MVP foi guiado pelos princípios da metodologia ágil, com as entregas divididas em Sprints e a seguinte distribuição de papéis:

* **Nícolas Okamoto Celestrino:** Product Owner (PO) / Gerente do Projeto
* **Matheus Carvalho Reis:** Scrum Master
* **Gabriel Azevedo Cruz:** Desenvolvedor (UX Designer)
* **Gabriel Mechi Lima:** Desenvolvedor (Database Engineer)
* **Lucas Ferri:** Desenvolvedor (QA - Quality Assurance)

## Como funciona (visão geral)

Não existe "site vítima" para atacar de fora: a análise é feita **direto sobre o banco**. O `pentest.py` grava nas tabelas de auditoria os mesmos rastros que um atacante real deixaria (vários IPs, força bruta, SQLi, exportação massiva, etc.) com horários recentes, e as regras de detecção varrem esses logs e levantam os alertas. O dashboard mostra tudo isso em tempo real.

```
┌────────────────┐      escreve ataques     ┌────────────┐
│  fillBank.py    │ ───────────────────────▶ │            │
│  pentest.py     │                          │   MySQL    │
│ (geram dados)   │                          │ banco_teste│
└────────────────┘                          └─────┬──────┘
                                                   │ consulta (regras de detecção)
                        ┌──────────────────────────┼───────────────────────────┐
                        ▼                          ▼                           ▼
              monitoramento.py            api.py (Flask, :5000)                │
              (imprime no terminal)       /api/alerts, /api/pentest,           │
                                          /api/reset, /api/locked-accounts,    │
                                          /api/ip-events, /api/measurements     │
                                                   │                           │
                                                   ▼                           │
                                      frontend (Vite/React, :5173) ◀───────────┘
```

- **`api.py`** (Flask, porta 5000) expõe as regras de detecção como HTTP, e tem os endpoints que o botão de pentest e o botão "Zerar painel" usam.
- **`monitoramento.py`** roda as mesmas regras direto no terminal, em loop (via `start.py`).
- **`frontend/`** é o dashboard (React + Vite, porta 5173). **Todas as telas leem dados reais da API** — começam zeradas e enchem conforme a detecção encontra algo. (Se a API estiver fora do ar, as telas ficam vazias; não há mais dados de demonstração embutidos.)

## Tecnologias Utilizadas

* **Python:** scripts de conexão, simulação de ataques, geração de massa de dados e API.
* **MySQL:** banco relacional para as tabelas de auditoria e credenciais.
* **SQLAlchemy:** ORM para mapeamento das tabelas e bloqueio nativo contra SQL Injection (via *bind parameters*).
* **Cryptography (AES-GCM):** criptografia bidirecional dos dados sensíveis.
* **Flask + Flask-CORS:** API HTTP que expõe os alertas e o pentest para o frontend.
* **React + Vite:** dashboard web.

## Pré-requisitos

- **Python 3.10+** instalado e no PATH
- **Node.js e npm** instalados
- **MySQL Server** rodando em `localhost:3306`, com usuário `root` e senha `root` (é o que todos os scripts esperam; se a sua for outra, veja [Solução de problemas](#solução-de-problemas))

> O banco `banco_teste` é criado e populado automaticamente na primeira execução.

## Como rodar — jeito fácil (Windows, 1 clique)

1. **Ligue o MySQL** (serviço do Windows, XAMPP, MySQL Workbench, etc.).
2. Dê **duplo clique em `iniciar.bat`**.

O `iniciar.bat` faz tudo sozinho: cria o ambiente virtual e instala as dependências na primeira vez, sobe a **API** (porta 5000) e o **Dashboard** (porta 5173), roda o monitoramento no terminal e **abre o navegador** em `http://localhost:5173`.

Para **encerrar tudo**, dê **duplo clique em `parar.bat`** (ou simplesmente feche a janela preta do `iniciar.bat`).

> Dica: botão direito em `iniciar.bat` → **Enviar para → Área de trabalho (criar atalho)** para iniciar direto do desktop.

## Como rodar — pela linha de comando

Com o MySQL ligado, na pasta do projeto:

```
python start.py
```

Isso faz tudo de uma vez:
- cria o `.venv` e instala as dependências do Python e do frontend, se faltarem (só na primeira vez);
- cria o banco `banco_teste` e popula com dados de teste (`fillBank.py`), só na primeira vez;
- sobe a **API** (`api.py`) em **http://localhost:5000**;
- roda `monitoramento.py` em loop, imprimindo os alertas no terminal;
- sobe o **frontend** em **http://localhost:5173** e abre o navegador.

Para parar: `Ctrl+C` no terminal (encerra tudo junto).

Opções úteis:
```
python start.py --reseed         # apaga e recria o banco com dados de teste do zero
python start.py --interval 10    # varredura do monitoramento a cada 10s em vez de 30s
python start.py --no-frontend    # só o backend (API + monitoramento)
python start.py --no-backend     # só o frontend
```

## Como usar (demonstração do pentest)

1. Abra o Dashboard em **http://localhost:5173**.
2. Na **Visão Geral** (ou na aba **Alertas**), use os botões:
   - **🧹 Zerar painel** — limpa tudo; o painel fica em zero.
   - **🔴 Rodar Pentest** — injeta os 7 padrões de ataque no banco e recarrega.
3. Veja os números saírem do zero e os alertas aparecerem. As demais telas também reagem:
   - **Alertas** — tabela de todos os alertas detectados, com filtros.
   - **Contas Bloqueadas** — contas em lockout, com contagem regressiva.
   - **Investigar IP** — linha do tempo dos eventos de cada IP (inclusive os de ataque).
   - **Medições / Exportação** — volume por loja, destacando exportação anômala.

Quer repetir? Clique em **Zerar painel** e rode o pentest de novo.

> Também dá para rodar o pentest pelo terminal: `python pentest.py` (ou `python pentest.py --clean` para limpar antes). Ele injeta os ataques e roda o `monitoramento.py` no fim para mostrar o que foi pego.

## Rodar partes isoladas (opcional)

- **Só a API:** `python api.py` (sobe em `http://localhost:5000`).
- **Só o frontend:** dentro de `frontend/`, `npm run dev`.
- **Resetar o banco (apaga as tabelas):** `python resetBank.py`. Depois rode `python start.py` de novo para recriar e popular.

### Endpoints da API

| Método | Rota | Para quê |
|---|---|---|
| GET  | `/api/alerts` | lista os alertas detectados agora |
| POST | `/api/pentest` | injeta os ataques e devolve os alertas (botão "Rodar Pentest"); body `{"clean": true}` limpa antes |
| POST | `/api/reset` | zera logs/medições e tira usuários das janelas de detecção (botão "Zerar painel") |
| GET  | `/api/locked-accounts` | contas em lockout |
| GET  | `/api/known-ips` | IPs presentes nos logs |
| GET  | `/api/ip-events?ip=…` | linha do tempo de um IP |
| GET  | `/api/measurements` | volume de medições por loja (24h) |

## Estrutura do projeto

```
├── iniciar.bat            # (Windows) 1 clique: liga API + Dashboard + monitoramento e abre o navegador
├── parar.bat             # (Windows) 1 clique: encerra tudo
├── start.py              # orquestra API + monitoramento + frontend
├── api.py                 # API Flask: alertas, pentest, reset e dados das telas
├── monitoramento.py       # regras de detecção (roda no terminal)
├── pentest.py             # simula ataques para testar a detecção
├── criarTabelas.py        # schema das tabelas (SQLAlchemy)
├── fillBank.py            # popula o banco com dados de teste (cenários normais e maliciosos)
├── resetBank.py           # apaga as tabelas
├── security.py            # criptografia AES-GCM
├── auth_demo.py           # exemplo de fluxo de autenticação
├── deteccao-vazamento.sql # consultas SQL de referência
├── requirements.txt
└── frontend/              # dashboard React + Vite
    └── src/
        └── pages/         # Dashboard, Alertas, Contas Bloqueadas, Investigar IP, Medições
```

## Solução de problemas

**`Access denied for user 'root'@'localhost'`** — a senha do MySQL na sua máquina não é `root`. Ou troque a senha do root para `root` (`ALTER USER 'root'@'localhost' IDENTIFIED BY 'root'; FLUSH PRIVILEGES;`), ou ajuste a senha nas strings de conexão de `start.py`, `api.py`, `pentest.py`, `fillBank.py`, `monitoramento.py`, `resetBank.py` e `auth_demo.py` (todos usam `mysql+pymysql://root:root@localhost:3306/banco_teste`).

**O navegador abre mas o painel fica tudo zerado** — isso é o estado inicial normal (não há mais dados de demonstração). Clique em **Rodar Pentest** para gerar detecções.

**`MySQL não está respondendo` / nada aparece** — o MySQL não está ligado. Inicie o serviço do MySQL e rode de novo. O `iniciar.bat`/`start.py` não liga o MySQL sozinho.

**`ModuleNotFoundError: No module named 'flask'`** — o `.venv` não tem as dependências. Rode `python start.py` (ele instala sozinho) ou, no `.venv` ativado, `pip install -r requirements.txt`.

**Alertas somem depois de um tempo** — as regras usam janelas de tempo (última 1h, 30min, 24h). Dados antigos saem da janela e param de aparecer. Clique em **Rodar Pentest** para gerar eventos novos.
