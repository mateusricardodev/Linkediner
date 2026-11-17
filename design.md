2. Teclado como cidadão de primeira classe
Atalhos globais: N novo, / busca, Ctrl K paleta de comandos, Esc fecha, Enter salva. Mostre a dica dentro do botão (um pequeno N ou Ctrl K ao lado do texto).
Paleta de comandos única, com resultados agrupados por tipo e navegação por setas.
Foco sempre visível (contorno de 2 px) e ordem de tabulação lógica.
Foco inicial no campo certo ao abrir uma janela, e o foco volta ao botão de origem ao fechar.
Setas navegam em listas e menus, Enter abre, Esc sai.
Atalhos nunca disparam enquanto a pessoa digita em um campo.
3. Mouse: hover, clique e densidade
Estado de hover em tudo que é clicável, sutil (fundo levemente mais claro), com cursor de mão.
Estado de pressionado (:active) e desabilitado bem distintos.
Linha inteira clicável, com a ação interna (editar, apagar) em botão separado, para não haver botão dentro de botão.
Ações secundárias aparecem no hover da linha (ícones de editar e apagar), mas também ficam acessíveis por teclado (aparecem no foco).
Dicas (tooltips) curtas em botões que só têm ícone, com atraso de ~400 ms.
Menu de contexto (botão “⋯”) em vez de poluir a linha com muitos botões.
Densidade maior que no celular: mais itens por tela, texto de 14 a 15 px, linhas de ~44 a 52 px. Mas sem apertar demais.
Tabelas, quando fizer sentido: cabeçalho fixo, ordenação por coluna, números alinhados à direita com tabular-nums.
4. Fluxo e fricção
Ação principal em um gesto. O campo de uso mais frequente fica sempre visível no topo.
Padrões inteligentes: lembre a última escolha (filtro, visibilidade, conta) e sugira valores enquanto a pessoa digita.
Desfazer em vez de confirmar. Ao apagar, mostre um aviso curto com “Desfazer” (~5 s), no canto da tela.
Confirmação só para o irreversível, com texto que explica a consequência.
Proteção contra descarte: fechar um formulário preenchido pergunta antes. Rascunho automático é melhor ainda.
Trava contra duplo clique nos botões de envio.
Aviso de repetido antes de criar algo igual.
Divulgação progressiva: opções secundárias recolhidas (“Alterar…”), listas longas com “Ver todas (n)”.
Lembrar o contexto: filtros, aba aberta e posição de rolagem sobrevivem a trocar de tela e voltar.
5. Formulários
Botão de salvar sempre visível (rodapé fixo da janela ou do formulário).
Validação junto ao campo, com mensagem específica e uma pequena sacudida (shake). Role até o campo com erro e dê foco nele.
Rótulo sempre visível, placeholder só como exemplo.
Máscaras e formato certo (valor, data, hora, telefone).
Chips de escolha rápida no lugar de listas suspensas quando há poucas opções.
Estado de envio visível: “Salvando…”, depois ✓, e fechar com pausa curta (~380 ms).
Duas colunas de campos quando o formulário é largo, agrupando campos relacionados.
6. Feedback e estados
Aviso curto (toast) no canto, com ação opcional, que nunca bloqueia o uso.
Destaque do item novo (a linha pisca por um instante).
Estados vazios com ação: ícone suave, frase útil e um botão.
Aviso de offline discreto e atualização ao voltar para a aba.
Abrir sem tela branca: cópia em cache primeiro, rede depois; skeleton só se não houver nada.
Notificações com estados: ponto de “não lida”, marcar como vista ao abrir, excluir e “Limpar todas”.
Atualização do app sem atrapalhar: só recarregar quando for seguro.
7. Animações (com tempos)

Rápido, com propósito e sempre desligável.

Onde	Tempo e estilo
Entrada de listas	Sobe e aparece, ~0,4 s, com atraso em escada de ~35 ms por item
Indicador do menu	Desliza com mola, ~0,42 s
Hover e pressionado	Transição de cor/fundo de ~0,15 a 0,2 s; botão encolhe levemente ao pressionar
Barras de progresso	Preenchem de 0 até o valor, ~0,8 s
Seta de seção que abre	Gira 180°, ~0,2 s
Janela abrindo	Aparece com leve subida e esmaecimento, ~0,2 a 0,25 s
Reordenar por arraste	A linha segue o cursor e as outras deslizam (FLIP), ~0,22 s, cubic-bezier(0.2, 0.8, 0.2, 1)
Marcar como concluído	O “check” faz um pop (escala)
Obrigatório: respeitar prefers-reduced-motion.
Anime só transform e opacity.
O conteúdo nunca espera a animação terminar.
Cuidado: animação de entrada em itens que mudam de posição recomeça a cada reordenação e briga com o movimento.
8. Sistema visual
Tokens de cor em variáveis, com tema claro e escuro pelo mesmo conjunto.
Cor com significado fixo (verde bom, vermelho problema, âmbar atenção) e nunca só cor: sempre ícone ou texto junto.
Uma só família de fonte, poucos pesos e tabular-nums para números.
Cantos arredondados e sombras suaves, sem brilho nem degradê chamativo.
Ícones de linha de uma só biblioteca.
Espaçamento em escala (4/8/12/16…) e alinhamento rígido.
Hierarquia tipográfica clara: título de página, título de seção, texto, texto auxiliar em cinza.
9. Acessibilidade
Auditoria automática com axe-core em todas as telas e nos dois temas. No Bolso saiu de 122 problemas para 0.
Contraste mínimo de 4,5:1 em texto pequeno.
O nome acessível contém o texto visível do botão.
Sem botão dentro de botão.
Estrutura da página: um <main>, um h1 por tela e regiões bem marcadas.
Janelas acessíveis: foco preso dentro enquanto abertas, Esc fecha, o foco volta à origem.
Respeitar “reduzir movimento”.
10. Texto e microcopy
Voz humana e curta. Nada de “Erro 500”.
Erro que ensina o que fazer, em vez de só dizer que falhou.
Verbo no botão: “Criar”, “Mover e apagar”.
Datas relativas: “Hoje”, “Amanhã”, “Há 2 dias”.
Formato local correto de datas, moeda e números.
Exemplos nos placeholders.
11. Qualidade
Todo fluxo crítico com teste ponta a ponta, e a lógica com teste unitário.
Capturas automáticas em larguras de computador comuns (1280, 1440, 1920) e nos dois temas.
Medir desempenho com volume grande (milhares de itens). Muita “UX ruim” é só lentidão.
Revisar olhando a tela de verdade: a maior parte dos ajustes finos do Bolso veio de capturas.
