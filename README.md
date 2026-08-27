# ⚡ Edge Rewards — Automação diária do Microsoft Rewards

Site local (dashboard web + bot) que faz **automaticamente** as tarefas diárias do
[Microsoft Rewards](https://rewards.bing.com/dashboard) — o programa de pontos que você vê no
Edge/Bing: check-in, daily set, punch card, promoções e buscas no Bing.

> ⚠️ **Leia antes de usar** — a automação do ganho de pontos **pode violar os Termos de Uso**
> do Microsoft Rewards e, em tese, levar à remoção de pontos ou suspensão da conta.
> O bot foi feito para uso **pessoal e moderado** (1 execução por dia, delays aleatórios
> estilo humano, perfil persistente). Use por sua conta e risco, apenas com a sua própria conta.

---

## O que o bot faz em uma execução

1. Abre o painel `rewards.bing.com/dashboard` com a **sua sessão** (cookies do seu navegador).
2. Lê o saldo e as tarefas pendentes do dia via API interna do painel
   (`/api/getuserinfo`).
3. Faz o **check-in diário** (quando disponível).
4. Completa o **daily set** (as 3–5 tarefas do dia: buscar, ler notícia, quiz…).
5. Marca a casa do **punch card**, se houver.
6. Conclui as **promoções** pendentes do dia.
7. Faz **N buscas aleatórias no Bing** (padrão: 10).
8. Relê o saldo e calcula os **pontos ganhos** — tudo registrado no histórico.

Durante a execução o dashboard mostra a **tela ao vivo** do navegador e os **logs em tempo real**.

---

## Como rodar

### No Windows (mais fácil — não precisa instalar nada)

1. No [repositório](https://github.com/Sr-agente208/edge), clique em **Code** → **Download ZIP** e extraia a pasta.
2. Dê **dois cliques em `iniciar.bat`**. Ele cuida de tudo sozinho:
   - se você **não tem Node.js**, baixa o Node v22 (LTS) direto pra dentro da pasta (1x só, ~36 MB);
   - instala as dependências (`npm install`, 1x só);
   - baixa o navegador do robô (Playwright Chromium, 1x só);
   - liga o painel e **abre `http://localhost:3000` no navegador**.
3. Cole o seu cookie na tela de login → **Entrar** → **Iniciar automação**.

> Se o Windows perguntar sobre o firewall, clique em “Permitir acesso”.
> Para parar, feche a janela do `iniciar.bat`.

### No Mac / Linux

```bash
./iniciar.sh   # exige Node.js 18+ (brew install node / nvm install --lts)
```

### Se você já tem Node.js

```bash
npm install     # no Windows/mac também baixa o Chromium automaticamente (postinstall)
npm start
```

Depois abra **http://localhost:3000** no navegador.

| Sistema | Observação |
|---|---|
| **Windows** | `iniciar.bat` auto-instala Node + Chromium. Se algo não baixar, rode `npx playwright install chromium`. |
| **Linux** | Usa o Chromium embutido no pacote npm (não depende de CDN). Atalho: `./iniciar.sh`. |
| **macOS** | Igual ao Windows (`npx playwright install chromium` se precisar). |

> O bot precisa estar rodando na máquina que tem acesso à sua sessão e à internet
> (ex.: seu PC, ligado no horário da execução automática).

---

## Passo 1 — Colocar a sessão (cookies)

O bot entra no painel usando os **cookies do seu navegador** (a mesma sessão com a qual você
está logado no Edge/Chrome). Nenhum dado de senha é usado.

1. No seu navegador, entre em <https://rewards.bing.com/dashboard>.
2. Pressione **F12** → aba **Network** (Rede).
3. Recarregue a página (**F5**) e clique na **primeira requisição** da lista
   (`dashboard` ou `getuserinfo`).
4. Em **Headers** → **Request Headers**, encontre `cookie`.
5. **Copie o valor inteiro** (começa com `MUID=…`) e cole no campo
   **“Sessão da sua conta”** no painel → **Salvar**.
6. Clique em **Verificar** — ele confere a sessão e mostra seu saldo sem gastar nada.

A sessão dura algumas semanas; quando expirar o painel avisa (“cookie desatualizado”) —
é só repetir o processo. Os cookies ficam salvos **apenas** em `data/cookies.json`
(fora do git).

## Passo 2 — Executar

- **▶ Executar agora** — roda na hora.
- **Agenda diária** — defina o horário (fuso de São Paulo) e ligue “ativada”.
  Rode o site todo dia nesse horário.
- **“Forçar”** — permite rodar de novo no mesmo dia (só se a 1ª execução falhou, por exemplo).

## Passo 3 — Acompanhar

- **Tela ao vivo**: screenshots do navegador a cada ~2,5 s.
- **Logs**: cada passo (check-in, daily set, punch card, promoções, buscas…).
- **Saldo / ganho**: pontos antes, depois e o delta da execução.
- **Histórico**: últimas 60 execuções.
- **Screenshots de depuração** ficam em `data/screenshots/` (incluindo erros).

---

## Ajustes (card “Agenda & ajustes”)

| Campo | Padrão | Descrição |
|---|---|---|
| Execução diária | 07:30 | Horário (America/Sao_Paulo) da execução automática |
| Buscas no Bing | 10 | Quantas buscas aleatórias por execução (1–20) |
| Tempo lendo página | 9 s | Pausa em cada página de tarefa (3–30 s) |

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| “Sessão inválida ou expirada” | Recopie os cookies (passo 1). |
| “Não consegui alcançar o rewards.bing.com” | A máquina onde o site roda não tem rede para o Bing — verifique internet/firewall. |
| Tarefas puladas (“tile não encontrado”) | O layout do painel mudou. Veja os screenshots em `data/screenshots/` e ajuste os padrões de texto em `src/automation.js` (funções `findTileByText`/`findClickableByText`). |
| Ganho 0 pontos | Normal se você já fez as tarefas manualmente no dia, ou se o limite de buscas do seu nível acabou. |
| Windows: “Chromium não encontrado” | `npx playwright install chromium` e rode de novo. |

## Estrutura

```
edge/
├── server.js            # Express + WebSocket + agendador (cron)
├── src/
│   ├── automation.js    # fluxo do bot (Playwright): check-in, daily set, punch card, promoções, buscas
│   ├── api.js           # API do painel (getuserinfo) + resumo do dia
│   ├── browser.js       # resolve o Chromium (Playwright ou embutido no npm, p/ Linux)
│   ├── cookies.js       # parse/salvamento da sessão
│   └── state.js         # estado + histórico (data/state.json)
├── public/              # dashboard web (HTML/CSS/JS puro, sem build)
├── test/                # smoke (rede) + dom.test.js (fixtures offline, 9 checks)
└── data/                # gitignore: cookies, estado, perfil do navegador, screenshots
```

## Testes

```bash
node test/dom.test.js   # offline (fixtures): valida detecção de botões/tiles e loop de buscas
node test/smoke.js      # requer internet: abre bing.com + rewards.bing.com
```

---

*Projeto pessoal. Microsoft Rewards, Bing e Edge são marcas da Microsoft; este repositório
não é afiliado ou endossado por ela.*
