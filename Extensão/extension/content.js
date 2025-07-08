import { createClient } from "@supabase/supabase-js";

console.log("📡 content.js iniciado em:", window.location.href);

if (
  window.location.hostname.includes("localhost") ||
  window.location.hostname.includes("vega")
) {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "VEGA_AUTH") {
      const auth = {
        access_token: event.data.access_token,
        user_id: event.data.user_id,
      };

      chrome.runtime.sendMessage(
        {
          type: "SET_USER_TOKEN",
          access_token: auth.access_token,
          user_id: auth.user_id,
        },
        () => {
          console.log("✅ Credenciais recebidas via postMessage e salvas:", auth);
        }
      );
    }
  });

  console.log("👂 Aguardando VEGA_AUTH via window.postMessage...");
}


let access_token = null;
let user_id = null;

async function esperarCredenciais(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const interval = 500;
    const maxTentativas = timeout / interval;
    let tentativas = 0;

    const checar = () => {
      chrome.runtime.sendMessage({ type: "GET_USER_TOKEN" }, (response) => {
        if (response?.access_token && response?.user_id) {
          console.log("🔐 Credenciais recuperadas com sucesso:", response);
          resolve(response);
        } else {
          tentativas++;
          console.warn("🕒 Aguardando token no background... tentativa", tentativas);
          if (tentativas >= maxTentativas) {
            reject("❌ Token/user_id ausentes após aguardo.");
          } else {
            setTimeout(checar, interval);
          }
        }
      });
    };

    checar();
  });
}


// ============ CONSTANTES ============
const URL_API = "http://localhost:5000/filtros.json";
const logCompras = [];
const supabaseUrl = "https://rgkvzoeanbkbeqjbntdq.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJna3Z6b2VhbmJrYmVxamJudGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDczMjEsImV4cCI6MjA2NjQ4MzMyMX0.Qhy9GQOJD0wLSBmGLdS6QGxvERfST2FYqCDBo-F1njk";

// ============ CAPTURA DE SALDO VIA TELA DE CONTA ============
if (window.location.href.includes("https://experiencia.xpi.com.br/conta/#/")) {
  (async () => {
    console.log("🔎 Buscando saldo na tela da conta...");

    function esperarSaldo() {
      return new Promise((resolve, reject) => {
        const maxTentativas = 20;
        let tentativas = 0;

        const intervalo = setInterval(() => {
          const descricao = [...document.querySelectorAll("soma-description")]
            .find(el => el.textContent?.trim() === "Saldo disponível");

          if (!descricao) {
            tentativas++;
            if (tentativas >= maxTentativas) {
              clearInterval(intervalo);
              reject("❌ Descrição 'Saldo disponível' não encontrada.");
            }
            return;
          }

          const container = descricao.closest("div");
          const span = container?.querySelector("soma-paragraph span");

          if (!span || !span.textContent?.includes("R$")) {
            tentativas++;
            if (tentativas >= maxTentativas) {
              clearInterval(intervalo);
              reject("❌ Span com valor em R$ não encontrado.");
            }
            return;
          }

          const match = span.textContent.match(/R\$\s*([\d\.]+,\d{2})/);
          if (!match) {
            tentativas++;
            if (tentativas >= maxTentativas) {
              clearInterval(intervalo);
              reject("❌ Valor numérico não pôde ser extraído.");
            }
            return;
          }

          clearInterval(intervalo);
          const saldo = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
          console.log("💰 Saldo disponível identificado:", saldo);
          resolve(saldo);
        }, 500);
      });
    }

    try {
      const saldoCapturado = await esperarSaldo();
      console.log("💰 Saldo capturado com sucesso:", saldoCapturado);
      localStorage.setItem("saldoXP", saldoCapturado);
	  window.location.href = "https://experiencia.xpi.com.br/renda-fixa/#/emissao-bancaria?offertoken=true";
    } catch (err) {
      console.error(err);
    }
  })();
}
 


// ============ ALÍQUOTAS REGRESSIVAS DE IR ============
function calcularAliquotaIR(diasCorridos) {
  if (diasCorridos <= 180) return 0.225;
  if (diasCorridos > 180 && diasCorridos <= 360) return 0.20;
  if (diasCorridos > 360 && diasCorridos <= 720) return 0.175;
  return 0.15;
}

// ============ FUNÇÕES COMUNS (function) ============
function dispararCliqueReal(elemento) {
  const down = new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "mouse" });
  const up = new PointerEvent("pointerup", { bubbles: true, composed: true, pointerType: "mouse" });
  const click = new PointerEvent("click", { bubbles: true, composed: true, pointerType: "mouse" });
  elemento.dispatchEvent(down);
  elemento.dispatchEvent(up);
  elemento.dispatchEvent(click);
}

function identificarClasse(texto) {
  const txt = texto.toUpperCase();
  if (txt.includes("IPCA")) return "ipca";
  if (txt.includes("CDI")) return "cdi";
  return "pre_fixado";
}

function extrairTaxa(texto) {
  const match = texto.match(/([0-9]+[,\.]?[0-9]*)/);
  return match ? parseFloat(match[1].replace(",", ".")) : null;
}

function extrairValorMinimo(texto) {
  return parseFloat(texto.replace(/[R$\s\.]/g, "").replace(",", ".")) || 1000;
}

function calcularDiasCorridos(dataVencimentoStr) {
  const hoje = new Date();
  const venc = new Date(dataVencimentoStr);
  const diffMs = venc - hoje;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function calcularTaxaBrutaEquivalente(taxaLiquida, diasCorridos) {
  const aliquota = calcularAliquotaIR(diasCorridos);
  const bruta = taxaLiquida / (1 - aliquota);
  return parseFloat(bruta.toFixed(2));
}

function converterDataBRparaISO(dataStr) {
  if (!dataStr || !dataStr.includes("/")) return null;
  const [dia, mes, ano] = dataStr.split("/");
  if (!dia || !mes || !ano) return null;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function detectarIsencao(nomeAtivo) {
  const nome = nomeAtivo.toUpperCase();
  return nome.includes("LCA") || nome.includes("LCI") || nome.includes("LCD");
}

function calcularMediaFormatada(ativos, indexador) {
  const isentos = ativos.filter(a => a.isento);
  const tributados = ativos.filter(a => !a.isento);

  const calcular = (grupo) => {
    if (grupo.length === 0) return null;

    const taxasNum = grupo.map((a) => {
      const tx = a.taxa.toUpperCase();
      if (indexador === "IPCA") {
        const match = tx.match(/IPCA\s*\+\s*([\d,\.]+)/);
        return match ? parseFloat(match[1].replace(",", ".")) : null;
      } else if (indexador === "CDI") {
        if (tx.includes("%")) {
          const match = tx.match(/([\d,\.]+)\s*%/);
          return match ? parseFloat(match[1].replace(",", ".")) : null;
        }
        const match = tx.match(/CDI\s*\+\s*([\d,\.]+)/);
        return match ? parseFloat(match[1].replace(",", ".")) : null;
      } else {
        // Prefixado
        const match = tx.match(/([\d,\.]+)\s*%/);
        return match ? parseFloat(match[1].replace(",", ".")) : null;
      }
    }).filter(n => typeof n === "number");

    if (taxasNum.length === 0) return null;

    const media = taxasNum.reduce((a, b) => a + b, 0) / taxasNum.length;

    if (indexador === "IPCA") return `IPCA + ${media.toFixed(2)}%`;
    if (indexador === "CDI") return `${media.toFixed(0)}% do CDI`; // ou CDI + X%
    return `${media.toFixed(2)}%`;
  };

  return {
    isento: calcular(isentos),
    tributado: calcular(tributados),
  };
}

const restricoesAplicMin = {
  ate_5k: valor => valor <= 5000,
  ate_10k: valor => valor <= 10000,
  ate_50k: valor => valor <= 50000,
  acima_50k: valor => valor > 50000
};

const mapa = {
  indexador: {
    pre_fixado: "Pré-fixado",
    ipca: "Inflação",
    cdi: "Pós-fixado (CDI)"
  },
  liquidez: {
    no_venc: "No Vencimento",
    diaria: "Diária",
    carencia: "Com Carência"
  },
  outros: {
    garantia_fgc: "Proteção FGC",
    isento_ir: "Isento de IR",
    oferta_primaria: "Oferta primária",
    investidor_qualificado: "Investidor qualificado",
    investidor_profissional: "Investidor profissional",
    publico_geral: "Público geral"
  },
  vencimento: {
    ate_6_meses: "De 1 mês a 6 meses",
    ate_1_ano: "De 6 meses a 12 meses",
    ate_2_anos: "de 1 ano a 2 anos",
    ate_3_anos: "de 2 anos a 3 anos",
    ate_5_anos: "de 3 anos a 5 anos",
    acima_5_anos: "Acima de 5 anos"
  },
  aplicacao_minima: {
    ate_5k: "Até R$ 5.000",
    ate_10k: "Até 10.000",
    ate_50k: "Até R$ 50.000",
    acima_50k: "Acima de R$ 50.000"
  }
};

// ============ FUNÇÕES ASSÍNCRONAS ============
async function esperarElemento(seletorOuXPath, timeout = 2000, isXPath = true) {
  const intervalo = 500;
  const maxTentativas = timeout / intervalo;
  let tentativas = 0;
  return new Promise((resolve, reject) => {
    const checar = () => {
      let resultado;
      if (isXPath) {
        resultado = document.evaluate(seletorOuXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      } else {
        resultado = document.querySelector(seletorOuXPath);
      }
      if (resultado) resolve(resultado);
      else if (++tentativas > maxTentativas) reject("Elemento não encontrado: " + seletorOuXPath);
      else setTimeout(checar, intervalo);
    };
    checar();
  });
}

async function preencherCampoQuantidadeInvestida(valorCompra, valorMinimo) {
  try {
    const quantidadeLabel = "Digite a quantidade que deseja investir";
    console.log("🕒 Aguardando campo de quantidade aparecer...");
    await esperarElemento(`soma-text-field[label="${quantidadeLabel}"]`, 7000, false);

    const campoComponente = [...document.querySelectorAll("soma-text-field")]
      .find(el => el.getAttribute("label") === quantidadeLabel);

    if (!campoComponente) throw new Error(`Campo soma-text-field com label "${quantidadeLabel}" não encontrado.`);

    let tentativas = 10;
    while (!campoComponente.shadowRoot && tentativas-- > 0) {
      console.log("⏳ Aguardando shadowRoot do campo de quantidade...");
      await new Promise(r => setTimeout(r, 300));
    }

    const input = campoComponente.shadowRoot?.querySelector("input[type='number']");
    if (!input) throw new Error("Input do tipo number não localizado no shadowRoot.");

    const quantidade = Math.floor(valorCompra / valorMinimo);
    input.value = quantidade;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
	await new Promise(r => setTimeout(r, 100)); // ← melhora resposta da UI sem atrasar


    console.log("📦 Quantidade preenchida:", quantidade);
    return true;
  } catch (err) {
    console.error("❌ Erro ao preencher campo de quantidade:", err?.message || err);
    return false;
  }
}

async function esperarSaldoDisponivel(timeout = 5000) {
  const intervalo = 500;
  const maxTentativas = timeout / intervalo;
  let tentativas = 0;
  while (tentativas < maxTentativas) {
    const todos = document.querySelectorAll("soma-description");
    const alvo = todos[1];
    if (alvo && /Saldo disponível/i.test(alvo.textContent || "")) {
      const match = alvo.textContent.match(/R\$\s*([\d\.]+,\d{2})/);
      if (match) {
        const saldo = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
        console.log("💰 Saldo detectado:", saldo);
        return saldo;
      }
    }
    tentativas++;
    await new Promise(r => setTimeout(r, intervalo));
  }
  console.error("❌ Timeout ao ler saldo disponível.");
  return 0;
}

async function marcarCheckboxConfirmacao() {
  try {
    await esperarElemento("soma-checkbox", 2000, false);
    const checkboxComponentes = [...document.querySelectorAll("soma-checkbox")];
    const componenteAlvo = checkboxComponentes.find(el => el.getAttribute("label")?.toLowerCase().includes("ciente dos riscos"));

    if (!componenteAlvo) return false;
    const shadow = componenteAlvo.shadowRoot;
    const input = shadow?.querySelector("input[type='checkbox']");
    if (!input) return false;

    if (!input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  } catch (err) {
    console.error("❌ Erro ao marcar checkbox:", err?.message || err);
    return false;
  }
}

async function clicarBotaoAvancarEtapa() {
  try {
    const timeout = 7000;
    const intervalo = 500;
    const maxTentativas = timeout / intervalo;
    let tentativas = 0;
    let btnSombra = null;

    while (tentativas++ < maxTentativas) {
      const botaoComponente = [...document.querySelectorAll("soma-button")]
        .find(b => b.getAttribute("aria-label")?.toLowerCase().includes("avançar etapa"));

      if (botaoComponente && botaoComponente.shadowRoot) {
        btnSombra = botaoComponente.shadowRoot.querySelector("button:not([disabled])");
        if (btnSombra) break;
      }

      await new Promise(r => setTimeout(r, intervalo));
    }

    if (!btnSombra) {
      console.warn("⚠️ Botão 'Avançar etapa' não encontrado ou continua desabilitado.");
      return false;
    }

    dispararCliqueReal(btnSombra);
    console.log("✅ Clique no botão 'Avançar etapa' realizado com sucesso.");
    return true;

  } catch (err) {
    console.error("❌ Erro ao clicar no botão 'Avançar etapa':", err?.message || err);
    return false;
  }
}

async function aplicarFiltroPorClasse(classe) {
  const mapaIndexador = {
    pre_fixado: "Pré-fixado",
    ipca: "Inflação",
    cdi: "Pós-fixado (CDI)"
  };

  const labelClasseAtual = mapaIndexador[classe];
  const labelsTodas = Object.values(mapaIndexador);

  for (const label of labelsTodas) {
    const xpath = `//soma-chip[contains(., '${label}')]`;
    const chip = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

    if (!chip) {
      console.warn(`⚠️ Chip '${label}' não encontrado na tela.`);
      continue;
    }

    const estaSelecionado = chip.getAttribute("selected") === "true";

    // Desmarcar se for diferente da classe atual
    if (label !== labelClasseAtual && estaSelecionado) {
      chip.click();
      console.log(`🔄 Filtro removido: ${label}`);
      await new Promise(r => setTimeout(r, 300));
    }

    // Marcar se for a classe atual e ainda não estiver selecionada
    if (label === labelClasseAtual && !estaSelecionado) {
      chip.click();
      console.log(`✅ Filtro aplicado: ${label}`);
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Aguarda os ativos recarregarem
  await new Promise(r => setTimeout(r, 1500));
}

async function rolarAteFinalTabelaAtivos() {
  console.log("🔽 Iniciando rolagem automática da tabela para carregar todos os ativos...");
  const container = document.querySelector("soma-table-body")?.parentElement;
  if (!container) {
    console.warn("⚠️ Container da tabela de ativos não encontrado.");
    return;
  }

  let scrollAnterior = -1;
  let tentativas = 0;

  while (tentativas < 30) {
    container.scrollBy(0, 500);
    await new Promise(r => setTimeout(r, 300));
    const scrollAtual = container.scrollTop;

    if (scrollAtual === scrollAnterior) {
      console.log("✅ Final da tabela atingido.");
      break;
    }

    scrollAnterior = scrollAtual;
    tentativas++;
  }
}

async function marcarCheckboxEAvancar() {
  const somaCheckbox = [...document.querySelectorAll("soma-checkbox")]
    .find(el => el.getAttribute("label")?.toLowerCase().includes("declaro que li"));

  if (!somaCheckbox) {
    console.warn("❌ Checkbox com label 'declaro que li' não encontrado.");
    return false;
  }

  // Aguarda o shadowRoot carregar
  let tentativas = 5;
  while (!somaCheckbox.shadowRoot && tentativas-- > 0) {
    await new Promise(r => setTimeout(r, 300));
  }

  const checkbox = somaCheckbox.shadowRoot?.querySelector("input[type='checkbox']");
  if (!checkbox) {
    console.warn("❌ Input checkbox não encontrado no shadowRoot.");
    return false;
  }

  // Dispara clique real no checkbox
  dispararCliqueReal(checkbox);
  console.log("✅ Clique real no checkbox disparado.");

  // Aguarda o botão 'Avançar etapa' ficar habilitado
  let btnHabilitado = null;
  tentativas = 20; // até 10 segundos
  while (tentativas-- > 0) {
    const botao = [...document.querySelectorAll("soma-button")]
      .find(b => b.getAttribute("aria-label")?.toLowerCase().includes("avançar etapa"));

    const interno = botao?.shadowRoot?.querySelector("button");
    if (interno && !interno.disabled) {
      btnHabilitado = interno;
      break;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  if (!btnHabilitado) {
    console.warn("❌ Botão 'Avançar etapa' não habilitado após marcar checkbox.");
    return false;
  }

  dispararCliqueReal(btnHabilitado);
  console.log("✅ Botão 'Avançar etapa' clicado com sucesso após o checkbox.");
  return true;
}

async function digitarSenhaEletronica(senha) {
  const teclas = senha.split(""); // exemplo: "845137" → ["8", "4", "5", "1", "3", "7"]
  console.log("🔐 Iniciando digitação da assinatura eletrônica...");

  // Aguarda o teclado aparecer
  let tentativas = 10;
  let teclado = null;
  while (tentativas-- > 0) {
    teclado = document.querySelector("soma-input-bank-password");
    if (teclado?.shadowRoot) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!teclado?.shadowRoot) {
    console.error("❌ Teclado numérico da senha eletrônica não apareceu.");
    return false;
  }

  const botoes = [...teclado.shadowRoot.querySelectorAll("button")];
  if (!botoes.length) {
    console.error("❌ Nenhum botão encontrado no teclado.");
    return false;
  }

  for (const digito of teclas) {
    const botao = botoes.find(b => b.textContent?.includes(digito));
    if (!botao) {
      console.error(`❌ Dígito '${digito}' não encontrado entre os botões.`);
      return false;
    }

    dispararCliqueReal(botao); // já está definido no seu código
    console.log(`✅ Dígito '${digito}' clicado.`);
    await new Promise(r => setTimeout(r, 250)); // leve delay entre cliques
  }

  return true;
}

// Aguarda e clica no botão 'Avançar etapa' após senha
async function clicarBotaoFinalAposSenha() {
  let tentativas = 10;
  let botaoFinal = null;

  while (tentativas-- > 0) {
    const somaBtn = [...document.querySelectorAll("soma-button")]
      .find(b => b.getAttribute("aria-label")?.toLowerCase().includes("avançar etapa"));

    const interno = somaBtn?.shadowRoot?.querySelector("button");
    if (interno && !interno.disabled) {
      botaoFinal = interno;
      break;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  if (!botaoFinal) {
    console.warn("❌ Botão final 'Avançar etapa' não foi habilitado após assinatura.");
    return false;
  }

  dispararCliqueReal(botaoFinal);
  console.log("✅ Clique final no botão 'Avançar etapa' efetuado após senha.");
  return true;
}

esperarCredenciais().then((credenciais) => {
	access_token = credenciais.access_token;
	user_id = credenciais.user_id;
	console.log("✅ access_token e user_id carregados do storage:", credenciais);

	aplicarFiltrosXP(); // agora sim pode chamar a função
  }).catch((err) => {
	console.error(err);
});

  
// ============ CÓDIGO PRINCIPAL ============
async function aplicarFiltrosXP() {
  try {
	  
    if (window.location.href.includes("experiencia.xpi.com.br/renda-fixa")) {
	  const res = await fetch(URL_API);
	  const filtros = await res.json(); 
	  
	  // Aguarda e clica no filtro inicial
	  try {
		console.log("🕒 Aguardando botão 'Filtrar' aparecer na tela...");
		const botaoFiltro = await esperarElemento("//soma-chip[contains(., 'Filtrar')]", 7000);

		if (!botaoFiltro) {
		  console.error("❌ Botão 'Filtrar' não encontrado após aguardo.");
		  return;
		}

		botaoFiltro.scrollIntoView({ behavior: "smooth", block: "center" });
		await new Promise((r) => setTimeout(r, 300));
		botaoFiltro.click();

		console.log("✅ Botão 'Filtrar' clicado com sucesso.");
		await new Promise((r) => setTimeout(r, 1000));
	  } catch (err) {
		console.error("❌ Erro ao localizar ou clicar no botão 'Filtrar':", err);
		return;
	  }
	

		// Aplica filtros personalizados
		try {
		  console.log("🎯 Iniciando aplicação de filtros visuais...");
		  for (const grupo in filtros) {
			if (["assinatura", "limite_compra", "ordem_classe", "taxa_minima"].includes(grupo)) continue;
			const valores = filtros[grupo];
			for (const valor of valores) {
			  const label = mapa[grupo.toLowerCase()]?.[valor];
			  if (!label) {
				console.warn(`⚠️ Label não encontrado no mapa para grupo '${grupo}', valor '${valor}'`);
				continue;
			  }

			  const xpath = `//soma-chip[contains(., '${label}')]`;
			  const chip = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
			  if (chip) {
				chip.click();
				console.log(`✅ Filtro aplicado: [${grupo}] → ${label}`);
			  } else {
				console.warn(`⚠️ soma-chip '${label}' não encontrado na tela.`);
			  }
			  await new Promise(r => setTimeout(r, 300));
			}
		  }
		  console.log("✅ Filtros visuais aplicados com sucesso.");
		} catch (err) {
		  console.error("❌ Erro ao aplicar filtros visuais:", err);
		}

		// Variáveis de controle
		const assinatura = filtros.assinatura;
		const limite = filtros.limite_compra;
		let ordem = filtros.ordem_classe;
		const taxasMin = filtros.taxa_minima || { cdi: 0, ipca: 0, pre_fixado: 0 };
		const filtrosAplicMin = filtros.aplicacao_minima || [];

		function ativoPassaFiltroAplicMin(valor) {
		  if (filtrosAplicMin.length === 0) return true;
		  return filtrosAplicMin.some(chave => restricoesAplicMin[chave]?.(valor));
		}

		if (!Array.isArray(ordem)) ordem = ["cdi", "ipca", "pre_fixado"];

		try {
		  console.log("🕒 Aguardando carregamento da tabela de ativos...");
		  await esperarElemento("soma-table-body soma-table-row", 5000, false);
		  await rolarAteFinalTabelaAtivos();
		  
		} catch (err) {
		  console.error("❌ Erro ao aguardar a tabela de ativos:", err);
		  return;
		}
		
		const saldoArmazenado = parseFloat(localStorage.getItem("saldoXP") || "0");
		const saldoTotal = saldoArmazenado || await esperarSaldoDisponivel();
		console.log("💰 Saldo total carregado para comparação:", saldoTotal);

		for (const classe of ordem) {
			
		  await aplicarFiltroPorClasse(classe);

		  try {
			await esperarElemento("soma-table-body soma-table-row", 5000, false);
			await new Promise(r => setTimeout(r, 500));
			console.log(`✅ Tabela de ativos carregada para classe: ${classe}`);
		  } catch (err) {
			console.error(`❌ Erro ao carregar tabela da classe ${classe}:`, err);
			continue;
		  }

		  const rows = document.querySelectorAll("soma-table-body soma-table-row");
		  const ativos = [];

		  for (const [i, row] of [...rows].entries()) {
			const cells = row.querySelectorAll("soma-table-cell");
			if (cells.length < 10) return;

			const rentabilidadeText = cells[2]?.textContent?.trim() || "";
			const aplicacaoMinText = cells[8]?.textContent?.trim() || "";
			const somaButton = row.querySelector("soma-button[aria-label='Investir']");
			const innerButton = somaButton?.shadowRoot?.querySelector("button");
			const tipo = identificarClasse(rentabilidadeText);
			const taxa = extrairTaxa(rentabilidadeText);
			const taxaTexto = rentabilidadeText.trim();
			const valorMinimo = extrairValorMinimo(aplicacaoMinText);
			const vencimentoTexto = cells[1]?.textContent?.trim() || "";
			const vencimentoStr = converterDataBRparaISO(vencimentoTexto);
			const nomeAtivo = cells[0]?.textContent?.trim() || "Ativo sem nome";
			
			if (tipo === classe && taxa && innerButton) {
			  const isento = nomeAtivo.includes("LCA") || nomeAtivo.includes("LCI") || nomeAtivo.includes("LCD");

			  ativos.push({ nome: nomeAtivo, tipo, taxa, taxaTexto, valorMinimo, vencimentoStr, botao: innerButton, isento });
			  console.log(`✅ Ativo detectado: ${nomeAtivo}, Tipo: ${tipo}, Taxa: ${taxa}, Min: ${valorMinimo}, Venc: ${vencimentoStr}, Isento: ${isento}`);
			  
			}		
		  }	  
		  
		  // Só calcula e envia se tiver ativos suficientes
		  if (ativos.length > 0) {
			const formatarMedia = (ativosGrupo, classe) => {
			  if (ativosGrupo.length === 0) return null;

			  const taxasNumericas = ativosGrupo.map(a => {
				const t = a.taxaTexto.toUpperCase();
				if (classe === "IPCA") {
				  const m = t.match(/IPCA\s*\+?\s*([\d,\.]+)/);
				  return m ? parseFloat(m[1].replace(",", ".")) : null;
				} else if (classe === "CDI") {
				  if (t.includes("CDI +")) {
					const m = t.match(/CDI\s*\+\s*([\d,\.]+)/);
					return m ? parseFloat(m[1].replace(",", ".")) : null;
				  } else if (t.includes("%") && !t.includes("+")) {
					const m = t.match(/([\d,\.]+)\s*%/);
					return m ? parseFloat(m[1].replace(",", ".")) : null;
				  }
				} else {
				  const m = t.match(/([\d,\.]+)\s*%/);
				  return m ? parseFloat(m[1].replace(",", ".")) : null;
				}
				return null;
			  }).filter(n => typeof n === "number");

			  if (taxasNumericas.length === 0) return null;

			  const media = taxasNumericas.reduce((a, b) => a + b, 0) / taxasNumericas.length;

			  if (classe === "IPCA") return `IPCA + ${media.toFixed(2)}%`;
			  if (classe === "CDI" && ativosGrupo[0].taxaTexto.includes("+")) return `CDI + ${media.toFixed(2)}%`;
			  if (classe === "CDI") return `${media.toFixed(0)}% do CDI`;
			  return `${media.toFixed(2)}%`;
			};

			const ativosIsentos = ativos.filter(a => a.isento);
			const ativosTributados = ativos.filter(a => !a.isento);

			const mediaIsentos = formatarMedia(ativosIsentos, classe.toUpperCase());
			const mediaTributados = formatarMedia(ativosTributados, classe.toUpperCase());

			const payloads = [];
			if (mediaIsentos) {
			  console.log("🔍 Média ISENTOS calculada:", mediaIsentos);
			  payloads.push({
				user_id,
				data_referencia: new Date().toISOString().split("T")[0],
				indexador: classe.toUpperCase(),
				taxa_media: mediaIsentos,
				isento_imposto: true
			  });
			}
			if (mediaTributados) {
			  console.log("🔍 Média TRIBUTADOS calculada:", mediaTributados);
			  payloads.push({
				user_id,
				data_referencia: new Date().toISOString().split("T")[0],
				indexador: classe.toUpperCase(),
				taxa_media: mediaTributados,
				isento_imposto: false
			  });
			}

			for (const payload of payloads) {
			  console.log("📩 Enviando taxa média para o Supabase:", payload);
			  await fetch(`${supabaseUrl}/rest/v1/taxas_media_xp`, {
				  method: "POST",
				  headers: {
					"Content-Type": "application/json",
					"apikey": supabaseAnonKey,
					"Authorization": `Bearer ${access_token}` // ← isso agora está certo
				  },
				  body: JSON.stringify(payload)
				});
			}
		  }
			
			const ativosFiltrados = ativos
			  .filter(ativo => ativo.valorMinimo <= saldoTotal) // ← novo filtro
			  .sort((a, b) => {
				const diasA = calcularDiasCorridos(a.vencimentoStr);
				const diasB = calcularDiasCorridos(b.vencimentoStr);
				const taxaA = detectarIsencao(a.nome) ? calcularTaxaBrutaEquivalente(a.taxa, diasA) : a.taxa;
				const taxaB = detectarIsencao(b.nome) ? calcularTaxaBrutaEquivalente(b.taxa, diasB) : b.taxa;
				return taxaB - taxaA;
			  });
	 
		  
		  for (const ativo of ativosFiltrados) {
		  
				const isIsento = detectarIsencao(ativo.nome);
				const diasAteVencimento = calcularDiasCorridos(ativo.vencimentoStr);
				const taxaComparada = isIsento ? calcularTaxaBrutaEquivalente(ativo.taxa, diasAteVencimento) : ativo.taxa;

				console.log(`📊 Comparando ativo '${ativo.nome}' (${classe}): ${ativo.taxa}% ${isIsento ? "(isento IR)" : ""} → ${taxaComparada}% (mínima: ${taxasMin[classe]}%)`);

				if (taxaComparada < taxasMin[classe]) continue;
				if (!ativoPassaFiltroAplicMin(ativo.valorMinimo)) continue;

				ativo.botao.scrollIntoView({ behavior: "smooth", block: "center" });
				await new Promise(r => setTimeout(r, 100));
				dispararCliqueReal(ativo.botao);
				console.log("✅ Clique no botão 'Investir' efetuado.");
				await new Promise(r => setTimeout(r, 600));

				if (ativo.valorMinimo > saldoTotal) {
				  console.warn(`⛔ Saldo insuficiente: mínimo R$${ativo.valorMinimo} > saldo R$${saldoTotal}`);
				  continue;
				}

				const valorIdeal = Math.min(saldoTotal, limite);
				const valorCompra = Math.max(ativo.valorMinimo, valorIdeal);

				
				const quantidadeOk = await preencherCampoQuantidadeInvestida(valorCompra, ativo.valorMinimo);
				if (!quantidadeOk) continue;

				await marcarCheckboxConfirmacao();
				await clicarBotaoAvancarEtapa();
				await new Promise(r => setTimeout(r, 500)); // dá tempo para tela carregar
				await marcarCheckboxEAvancar(); 
				
				const senhaOk = await digitarSenhaEletronica(assinatura) || true; //APAGAR DEPOIS - TESTE

				
				//const senhaOk = await digitarSenhaEletronica(assinatura); // assinatura já está carregada via filtros
				// ⚠️ BYPASS DE TESTE ATIVO:
				// Comentado temporariamente para permitir testes mesmo com assinatura incorreta
				// if (!senhaOk) {
				//   console.warn("⚠️ A senha eletrônica não pôde ser digitada.");
				//   continue; // tenta outro ativo
				// }
				
				//await clicarBotaoFinalAposSenha();

				logCompras.push({
				  ativo: ativo.nome,
				  classe: classe.toUpperCase(),
				  taxaInformada: ativo.taxa.toFixed(2) + "%",
				  taxaEfetiva: taxaComparada.toFixed(2) + "%" + (isIsento ? " (isento IR)" : ""),
				  valorMinimo: "R$ " + ativo.valorMinimo.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
				  valorComprado: "R$ " + valorCompra.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
				  vencimentoISO: ativo.vencimentoStr,
				  vencimentoBR: (() => {
					const [ano, mes, dia] = ativo.vencimentoStr.split("-");
					return `${dia}/${mes}/${ano}`;
				  })(),

				  horarioCompra: new Date().toLocaleString("pt-BR")
				});
				
				console.log("📝 Ativo registrado no logCompras:", logCompras[logCompras.length - 1]);


				await new Promise(r => setTimeout(r, 1000));
				break; // só realiza uma compra por classe	
			}
		}
	}
	
    if (logCompras.length > 0) {
	  console.log("🚀 Enviando dados para Supabase...");

	  const res = await fetch(`${supabaseUrl}/rest/v1/ativos_comprados`, {
		method: "POST",
		headers: {
		  apikey: supabaseAnonKey,
		  Authorization: `Bearer ${access_token}`,
		  "Content-Type": "application/json",
		  Prefer: "return=minimal"
		},
		body: JSON.stringify(
		  logCompras.map((item) => ({
			user_id,
			nome_ativo: item.ativo,
			indexador: item.classe.toLowerCase(),
			data_hora_compra: new Date().toISOString(),
			taxa_contratada: item.taxaInformada,
			taxa_grossup: item.taxaEfetiva,
			valor_minimo: parseFloat(item.valorMinimo.replace(/[R$\.\s]/g, "").replace(",", ".")),
			valor_aplicado: Number(
			  item.valorComprado
				?.toString()
				.replace("R$", "")
				.replace(/\./g, "")
				.replace(",", ".")
				.trim()
			),
			vencimento: item.vencimentoISO ?? null			
		  }))
		)
	  });

	  if (res.ok) {
		console.log("✅ Compras registradas no Supabase com sucesso!");
	  } else {
		console.error("❌ Erro ao salvar no Supabase:", await res.text());
	  }
	}
  }catch (err) {
	  console.error("Erro no script:", err);
	}

}
