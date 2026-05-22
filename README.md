# Low-Profile-Fingerprint

Userscript para reduzir a unicidade do fingerprint do navegador com ruído leve por sessão e normalização defensiva.

## Visão geral

**Low-Profile-Fingerprint** é um userscript focado em privacidade que tenta dificultar técnicas comuns de browser fingerprinting sem depender de bloqueio bruto ou quebra agressiva de APIs. Em vez de “apagar” a identidade do navegador, o script reduz sinais muito específicos e adiciona pequenas variações plausíveis por sessão.

A proposta é simples: fazer o navegador parecer menos único para sistemas que tentam identificar usuários por características como tela, timezone, canvas, WebGL, fontes, plugins, bateria e conexão.

## Como funciona

O script roda no `document-start`, antes de boa parte das leituras de fingerprint acontecerem, e aplica ajustes defensivos em APIs comumente usadas para identificação do navegador.

Entre os sinais tratados pelo script estão:

- `screen` (largura, altura, área disponível, profundidade de cor)
- `navigator` (hardware concurrency, memória do dispositivo, plugins e mimeTypes)
- `timezone` (`getTimezoneOffset` e `Intl.DateTimeFormat().resolvedOptions()`)
- `canvas` (`getImageData`, `toDataURL`, `toBlob`)
- `fonts` via ruído leve em medições de texto
- `connection` (`rtt`, `downlink`, `effectiveType`, `type`)
- `speechSynthesis` (normalização da lista de vozes)
- `battery` (fachada para propriedades da Battery API)
- `WebGL` (vendor, renderer e alguns parâmetros)

Esse tipo de abordagem segue a lógica de anti-fingerprinting por normalização e ruído leve: reduzir a estabilidade e a singularidade de sinais expostos sem tornar o navegador obviamente falso ou incoerente.

## Analogia

Imagine que entrar em um site é como entrar em um shopping onde um segurança tenta reconhecer cada visitante pela roupa, pelo jeito de andar, pelo relógio e pelos detalhes do tênis. Browser fingerprinting faz algo parecido: em vez de pedir seu nome, ele observa características técnicas do navegador para decidir se “já viu você antes”.

O **No Fingerprint** funciona como um disfarce leve e coerente. Você continua entrando normalmente, mas com detalhes menos únicos e com pequenas mudanças por sessão, ficando mais parecido com “mais uma pessoa comum” do que com alguém fácil de reconhecer à distância.

## Recursos

- Execução antecipada com `@run-at document-start`
- Ruído leve e consistente por sessão
- Normalização defensiva de múltiplas APIs do navegador
- Menu de configuração com ativação e desativação de patches
- Compatibilidade com gerenciadores como Tampermonkey e similares.

## Instalação

1. Instale um gerenciador de userscripts, como Tampermonkey ou Violentmonkey.
2. Habilite a opção de permitir scripts de usuário no navegador/extensão, se ela aparecer.
3. Abra o arquivo `no-fingerprint.user.js`.
4. Instale o script pelo gerenciador.
5. Recarregue as páginas em que deseja testar o comportamento.

## Metadata sugerido

```javascript
// ==UserScript==
// @name         No Fingerprint
// @namespace    https://github.com/Devzinh/no-fingerprint
// @version      1.0.0
// @description  Disfarça seu navegador: normaliza sinais comuns de fingerprint e adiciona ruído leve por sessão para reduzir rastreamento.
// @author       Rony Gabriel
// @homepageURL  https://github.com/Devzinh/no-fingerprint
// @supportURL   https://github.com/Devzinh/no-fingerprint/issues
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==
```

## Limitações

Este projeto não promete anonimato total. Browser fingerprinting combina muitos sinais diferentes, e técnicas anti-fingerprinting mal calibradas podem até tornar um navegador mais identificável quando criam padrões raros ou inconsistentes.

Também é possível que alguns sites reajam de forma inesperada a mudanças em APIs como canvas, WebGL, timezone ou battery, especialmente em aplicações muito sensíveis a ambiente gráfico ou detecção de hardware.

## Casos de uso

- Estudo prático de browser fingerprinting
- Projeto de portfólio voltado a privacidade e segurança
- Testes defensivos com userscripts
- Exploração de APIs de navegador e normalização de sinais

## Roadmap

- Adicionar exclusões por domínio
- Criar modo balanceado e modo estrito
- Melhorar documentação técnica de cada patch
- Publicar versão instalável por release
- Adicionar testes de compatibilidade por site

## Topics sugeridos

Use estes tópicos no GitHub para melhorar a descoberta do repositório:

- `userscript`
- `tampermonkey`
- `privacy`
- `browser-fingerprinting`
- `fingerprint-protection`
- `anti-tracking`
- `javascript`
- `security`

## Licença

MIT
