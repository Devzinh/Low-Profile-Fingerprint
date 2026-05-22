# Low-Profile-Fingerprint

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Issues](https://img.shields.io/github/issues/Devzinh/Low-Profile-Fingerprint)](https://github.com/Devzinh/Low-Profile-Fingerprint/issues)

<p align="center">
  <img src="assets/Fingerprint Banner.png" alt="Low-Profile-Fingerprint userscript banner" width="640">
</p>

Userscript para reduzir a unicidade do fingerprint do navegador com ruído leve por sessão e normalização defensiva.

**English version:** [README.en.md](README.en.md)

## Índice

- [Visão geral](#visão-geral)
- [Como funciona](#como-funciona)
- [Analogia](#analogia)
- [Recursos](#recursos)
- [Instalação](#instalação)
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
- `fonts` via ruído leve em medições de texto
- `connection` (`rtt`, `downlink`, `effectiveType`, `type`)
- `speechSynthesis` (normalização da lista de vozes)
- `battery` (fachada para propriedades da Battery API)
- `WebGL` (vendor, renderer e alguns parâmetros)

Esse tipo de abordagem segue a lógica de anti-fingerprinting por normalização e ruído leve: reduzir a estabilidade e a singularidade de sinais expostos sem tornar o navegador obviamente falso ou incoerente.

## Analogia

Imagine que entrar em um site é como entrar em um shopping onde um segurança tenta reconhecer cada visitante pela roupa, pelo jeito de andar, pelo relógio e pelos detalhes do tênis. Browser fingerprinting faz algo parecido: em vez de pedir seu nome, ele observa características técnicas do navegador para decidir se "já viu você antes".

O **Low-Profile-Fingerprint** funciona como um disfarce leve e coerente. Você continua entrando normalmente, mas com detalhes menos únicos e com pequenas mudanças por sessão, ficando mais parecido com "mais uma pessoa comum" do que com alguém fácil de reconhecer à distância.

## Recursos

- Execução antecipada com `@run-at document-start`
- Ruído leve e consistente por sessão
- Normalização defensiva de múltiplas APIs do navegador
- Menu de configuração com ativação e desativação de patches
- Compatibilidade com gerenciadores como Tampermonkey e similares

## Instalação

Você pode instalar a versão mais recente diretamente pelo repositório:

- [Instalar via Tampermonkey / Userscript manager](https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js)

Passos manuais:

1. Instale um gerenciador de userscripts, como Tampermonkey ou Violentmonkey.
2. Habilite a opção de permitir scripts de usuário no navegador/extensão, se ela aparecer.
3. Abra o arquivo `low-profile-fingerprint.user.js`.
4. Instale o script pelo gerenciador.
5. Recarregue as páginas em que deseja testar o comportamento.

## Teste rápido

1. Instale o script normalmente.
2. Visite [BrowserLeaks](https://browserleaks.com/) ou outro teste de fingerprint.
3. Compare o comportamento do navegador com e sem o script ativado.
4. Verifique possíveis mudanças em canvas, WebGL, timezone e outros sinais expostos.

## Canvas — Antes e Depois

Teste realizado no [BrowserLeaks Canvas](https://browserleaks.com/canvas) comparando o comportamento com e sem o script ativo.

### Com o script ativo

<p align="center">
  <img src="assets/canvas-com-script.png" alt="Canvas fingerprint com o script ativo" width="700">
</p>

### Sem o script

<p align="center">
  <img src="assets/canvas-sem-script.png" alt="Canvas fingerprint sem o script" width="700">
</p>

**O que isso mostra:**

- As assinaturas são completamente diferentes — o ruído injetado no canvas altera o hash de forma efetiva.
- Sem o script, o canvas é 100% único no banco do BrowserLeaks, ou seja, rastreável com precisão.
- Com o script, o site enxerga uma assinatura diferente da real, dificultando a identificação.
- A diferença no File Size e Number of Colors confirma que os pixels foram alterados de verdade.

> Teste feito com Chrome no Windows 10. Resultados podem variar por navegador e hardware.

## Metadata sugerido

```javascript
// ==UserScript==
// @name         Low-Profile-Fingerprint
// @namespace    https://github.com/Devzinh/Low-Profile-Fingerprint
// @version      1.0.0
// @description  Disfarça seu navegador: normaliza sinais comuns de fingerprint e adiciona ruído leve por sessão para reduzir rastreamento.
// @author       Rony Gabriel
// @homepageURL  https://github.com/Devzinh/Low-Profile-Fingerprint
// @supportURL   https://github.com/Devzinh/Low-Profile-Fingerprint/issues
// @updateURL    https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
// @downloadURL  https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
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

## Contribuição

Sugestões, issues e pull requests são bem-vindos.

Se quiser contribuir, você pode:
- reportar incompatibilidades com sites
- sugerir novos patches
- melhorar a documentação
- propor ajustes de compatibilidade e privacidade

## Roadmap

- Adicionar exclusões por domínio
- Criar modo balanceado e modo estrito
- Melhorar documentação técnica de cada patch
- Publicar versão instalável por release
- Adicionar testes de compatibilidade por site

## Suporte

- [Abrir uma issue](https://github.com/Devzinh/Low-Profile-Fingerprint/issues)

## Licença

MIT
