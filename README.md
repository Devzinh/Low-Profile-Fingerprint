# Low-Profile-Fingerprint

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Issues](https://img.shields.io/github/issues/Devzinh/Low-Profile-Fingerprint)](https://github.com/Devzinh/Low-Profile-Fingerprint/issues)
[![Suporte a Gerenciadores](https://img.shields.io/badge/Tampermonkey%20%7C%20Violentmonkey-suportado-blueviolet.svg)](#instalação)
[![Idioma](https://img.shields.io/badge/idioma-PT--BR%20%7C%20EN-blue.svg)](#)

<p align="center">
  <img src="assets/Fingerprint Banner.png" alt="Low-Profile-Fingerprint userscript banner" width="640">
</p>

Userscript v1.4.0 para reduzir a unicidade do fingerprint do navegador com ruído leve por sessão e normalização defensiva baseada em dados reais do ambiente.

**English version:** [README.en.md](README.en.md)

## Índice

- [Visão geral](#visão-geral)
- [Como funciona](#como-funciona)
- [Como os Sinais São Tratados](#como-os-sinais-são-tratados)
- [Analogia](#analogia)
- [Recursos](#recursos)
- [Modos de privacidade](#modos-de-privacidade)
- [Instalação](#instalação)
- [Exclusão por domínio](#exclusão-por-domínio)
- [Teste rápido](#teste-rápido)
- [Canvas — Antes e Depois](#canvas--antes-e-depois)
- [Metadata sugerido](#metadata-sugerido)
- [Limitações](#limitações)
- [Casos de uso](#casos-de-uso)
- [Contribuição](#contribuição)
- [Roadmap](#roadmap)
- [Suporte](#suporte)
- [Licença](#licença)

## Visão geral

**Low-Profile-Fingerprint** é um userscript focado em privacidade que tenta dificultar técnicas comuns de browser fingerprinting sem depender de bloqueio bruto ou quebra agressiva de APIs. Em vez de "apagar" a identidade do navegador, o script reduz sinais muito específicos e adiciona pequenas variações plausíveis por sessão.

A proposta é simples: fazer o navegador parecer menos único para sistemas que tentam identificar usuários por características como tela, timezone, canvas, WebGL, fontes, plugins, bateria e conexão.

## Como funciona

O script roda no `document-start`, antes de boa parte das leituras de fingerprint acontecerem, e aplica ajustes defensivos em APIs comumente usadas para identificação do navegador.

Entre os sinais tratados pelo script estão:

- `screen` (largura, altura, área disponível, profundidade de cor)
- `navigator` (hardware concurrency, memória do dispositivo, plugins e mimeTypes)
- `timezone` (`getTimezoneOffset` e `Intl.DateTimeFormat().resolvedOptions()`)
- `canvas` (`getImageData`, `toDataURL`, `toBlob`)
- `audio` (`AudioBuffer.getChannelData` e `AnalyserNode.getFloatFrequencyData`)
- `fonts` via ruído leve em medições de texto
- `clientRects` (`getBoundingClientRect` e `getClientRects`) com ruído sub-pixel
- `connection` (`rtt`, `downlink`, `effectiveType`, `type`)
- `speechSynthesis` (normalização da lista de vozes)
- `battery` (fachada para propriedades da Battery API)
- `WebGL` (vendor, renderer, parâmetros selecionados e `readPixels`)

Esse tipo de abordagem segue a lógica de anti-fingerprinting por normalização e ruído leve: reduzir a estabilidade e a singularidade de sinais expostos sem tornar o navegador obviamente falso ou incoerente.

Desde a v1.2.0, o script evita perfis inventados: sinais como WebGL, conexão, plugins, mimeTypes e vozes são lidos do navegador real e apenas normalizados, ordenados, bucketizados ou suavizados de forma determinística.

## Como os Sinais São Tratados

| API / Recurso | Método Utilizado | Objetivo de Privacidade |
| :--- | :--- | :--- |
| **Canvas 2D** | Injeção de Ruído Dinâmico | Altera levemente o canal de pixels para gerar hashes de assinatura sempre diferentes por sessão. |
| **WebGL** | Normalização de Valores Reais & Ruído | Lê `VENDOR` e `RENDERER` reais via WebGL padrão, normaliza/trunca as strings e insere ruído em capturas de pixel buffer via `readPixels`. |
| **Screen & Window** | Bucketing Coerente | Bucketiza dimensões reais de tela e deriva a área disponível dos valores reais normalizados. |
| **Navigator plugins / mimeTypes** | Redução de Entropia Real | Usa apenas entradas reais do navegador, com normalização, deduplicação e ordenação determinística. |
| **Speech voices** | Ordenação Determinística | Reordena vozes reais por seed de sessão sem fabricar vozes inexistentes nem aplicar limite fixo. |
| **Element rects** | Ruído Sub-pixel | Adiciona variação sub-pixel à largura/altura de `getBoundingClientRect`/`getClientRects`, preservando posição (x/y/top/left) para não afetar o layout. |
| **Audio / Fonts** | Ruído em Medições | Adiciona microvariações em leituras de fontes e saídas de áudio sem distorcer o funcionamento. |
| **Battery** | Fachada Defensiva | Reduz telemetria variável da Battery API para valores menos identificáveis. |
| **Connection** | Bucketing de Valores Reais | Bucketiza `rtt` e `downlink` reais e preserva `type`/`effectiveType` reais quando a API existe. |

## Analogia

Imagine que entrar em um site é como entrar em um shopping onde um segurança tenta reconhecer cada visitante pela roupa, pelo jeito de andar, pelo relógio e pelos detalhes do tênis. Browser fingerprinting faz algo parecido: em vez de pedir seu nome, ele observa características técnicas do navegador para decidir se "já viu você antes".

O **Low-Profile-Fingerprint** funciona como um disfarce leve e coerente. Você continua entrando normalmente, mas com detalhes menos únicos e com pequenas mudanças por sessão, ficando mais parecido com "mais uma pessoa comum" do que com alguém fácil de reconhecer à distância.

## Recursos

- Execução antecipada com `@run-at document-start`
- Ruído leve e consistente por sessão
- Normalização defensiva de múltiplas APIs do navegador
- Sem listas hardcoded de hardware, plugins, conexão ou vozes inventadas
- Wrappers com proteção contra aplicação duplicada e menor exposição via `Function.prototype.toString`
- Menu de configuração com ativação e desativação de patches
- Modos de privacidade (`light`, `balanced`, `strict`) que ajustam a intensidade do ruído e do bucketing
- Ruído sub-pixel em `getBoundingClientRect`/`getClientRects` sem quebrar o layout
- Exclusão por domínio para desativar o script em sites específicos sem recarregar configurações
- Compatibilidade com gerenciadores como Tampermonkey e similares

## Modos de privacidade

A partir da v1.4.0 o script oferece três modos que ajustam, de forma centralizada, a granularidade do bucketing e a intensidade do ruído. O modo padrão é o `balanced`.

| Modo | Bucketing de tela / hardware | Ruído de canvas / WebGL / áudio | Ruído de `clientRects` | Indicação |
| :--- | :--- | :--- | :--- | :--- |
| **light** | Fino (menos perda de informação) | Suave | ~0,02 px | Máxima compatibilidade com sites sensíveis |
| **balanced** | Médio | Médio | ~0,05 px | Equilíbrio entre privacidade e compatibilidade (padrão) |
| **strict** | Grosso (menor unicidade) | Forte | ~0,1 px | Máxima redução de entropia |

Para alternar o modo, use o comando **Low-Profile Fingerprint: modo (...)** no menu do gerenciador de userscripts. O valor é persistido via `GM_setValue` e passa a valer após recarregar a página.

> Modos mais agressivos reduzem a unicidade ao custo de maior chance de incompatibilidade. Se um site quebrar, prefira um modo mais leve ou use a exclusão por domínio.

## Instalação

Você pode instalar a versão mais recente diretamente pelo repositório:

- [Instalar via Tampermonkey / Userscript manager](https://raw.githubusercontent.com/Devzinh/Low-Profile-Fingerprint/main/low-profile-fingerprint.user.js)

Passos manuais:

1. Instale um gerenciador de userscripts, como Tampermonkey ou Violentmonkey.
2. Habilite a opção de permitir scripts de usuário no navegador/extensão, se ela aparecer.
3. Abra o arquivo `low-profile-fingerprint.user.js`.
4. Instale o script pelo gerenciador.
5. Recarregue as páginas em que deseja testar o comportamento.

## Exclusão por domínio

Se algum site quebrar com os patches ativos, você pode desativar o script apenas naquele domínio sem desinstalá-lo:

1. Abra o site afetado.
2. No menu do gerenciador de userscripts, escolha **Low-Profile Fingerprint: Desativar neste site**.
3. Recarregue a página. O script passa a ignorar o domínio (e seus subdomínios) e não aplica nenhum patch.
4. Para voltar a proteger o site, use **Low-Profile Fingerprint: Ativar neste site** e recarregue.

A lista de exclusões é persistida pelo gerenciador via `GM_setValue`, então permanece entre sessões.

## Teste rápido

1. Instale o script normalmente.
2. Visite uma das ferramentas recomendadas abaixo.
3. Compare o comportamento do navegador com e sem o script ativado.
4. Verifique possíveis mudanças em canvas, WebGL, timezone e outros sinais expostos.

### Ferramentas recomendadas para teste

- **[BrowserLeaks](https://browserleaks.com/)**: Excelente para testar assinaturas específicas como Canvas, WebGL, fontes e APIs de geolocalização/bateria.
- **[CreepJS](https://abrahamjuliot.github.io/creepjs/)**: Uma das ferramentas mais avançadas para testar a robustez do ruído e se as APIs parecem simuladas ou genuínas.
- **[Cover Your Tracks (EFF)](https://coveryourtracks.eff.org/)**: Ferramenta da Electronic Frontier Foundation para conferir seu índice geral de rastreabilidade e unicidade.

## Canvas — Antes e Depois

Teste realizado no [BrowserLeaks Canvas](https://browserleaks.com/canvas) comparando o comportamento com e sem o script ativo.

| Campo | Com script | Sem script |
|---|---|---|
| **Assinatura** | `8D90D8D3DCAEA9CAF5DCAA8803BCCD3D` | `46CB33F5471311B5329087A2E5FCE3A2` |
| **Unicidade** | 99,96% | **100% (único no banco de dados)** |
| **Tamanho do Arquivo** | 5594 bytes | 5709 bytes |
| **Quantidade de Cores** | 220 | 233 |

### Sem o script

<p align="center">
  <img src="assets/browserleaks-before.png" alt="Canvas fingerprint sem o script" width="700">
</p>

### Com o script

<p align="center">
  <img src="assets/browserleaks-after.png" alt="Canvas fingerprint com o script ativo" width="700">
</p>

**O que isso mostra:**

- As assinaturas são completamente diferentes — o ruído injetado no canvas altera o hash de forma efetiva.
- Sem o script, o canvas é 100% único no banco do BrowserLeaks, ou seja, rastreável com precisão.
- Com o script, o site enxerga uma assinatura diferente da real, dificultando a identificação.
- A diferença no File Size e Number of Colors confirma que os pixels foram alterados de verdade.

> Teste feito com Comet/Chrome/Firefox no Windows 11. Resultados podem variar por navegador e hardware.

## Metadata sugerido

```javascript
// ==UserScript==
// @name         Low-Profile-Fingerprint
// @namespace    https://github.com/Devzinh/Low-Profile-Fingerprint
// @version      1.4.0
// @description  Disfarça seu navegador: normaliza sinais comuns de fingerprint e adiciona ruído leve por sessão para reduzir rastreamento sem quebrar sites.
// @author       Rony Gabriel
// @homepageURL  https://github.com/Devzinh/Low-Profile-Fingerprint
// @supportURL   https://github.com/Devzinh/Low-Profile-Fingerprint/issues
// @updateURL    https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
// @downloadURL  https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
// @license      MIT
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

Também é possível que alguns sites reajam de forma inesperada a mudanças em APIs como canvas, WebGL, áudio, timezone ou battery, especialmente em aplicações muito sensíveis a ambiente gráfico, processamento de áudio ou detecção de hardware.

## Casos de uso

- Estudo prático de browser fingerprinting
- Projeto de portfólio voltado a privacidade e segurança
- Testes defensivos com userscripts
- Exploração de APIs de navegador e normalização de sinais

## Contribuição

Sugestões, issues e pull requests são bem-vindos.

Se quiser contribuir, você pode:
- reportar incompatibilidades com sites
- sugerir novos patches
- melhorar a documentação
- propor ajustes de compatibilidade e privacidade

## Roadmap

- Melhorar documentação técnica de cada patch
- Publicar versão instalável por release
- Adicionar testes de compatibilidade por site

## Suporte

- [Abrir uma issue](https://github.com/Devzinh/Low-Profile-Fingerprint/issues)

## Licença

MIT
