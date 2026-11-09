import type { Metadata } from 'next';
import { LegalPage } from '../../components/legal-page';
import { LEGAL } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade · LinkedIner',
  description:
    'Quais dados o LinkedIner trata, para quê, por quanto tempo e como exercer seus direitos.',
};

const mail = <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>;

/**
 * Escrita a partir do que o sistema faz (docs/arquitetura/07 e ADRs 0008, 0012, 0019, 0020, 0021).
 * Ao mudar o comportamento descrito aqui, mude o texto e a versão (lib/legal.ts).
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      intro={
        <>
          <p>
            Esta política explica quais dados pessoais o LinkedIner trata, para quê, com quem eles
            são compartilhados e como você controla tudo isso, conforme a Lei Geral de Proteção de
            Dados (Lei 13.709/2018, LGPD).
          </p>
          <p>
            Em resumo: usamos os seus documentos só para montar o seu perfil e os seus currículos, a
            análise por IA depende da sua autorização, nada é enviado a uma empresa sem a sua
            aprovação, e você pode exportar ou apagar os seus dados.
          </p>
        </>
      }
      sections={[
        {
          id: 'quem-somos',
          title: 'Quem é o responsável pelos dados',
          body: (
            <p>
              O controlador dos dados é {LEGAL.controller}
              {LEGAL.document ? `, ${LEGAL.document}` : ''}. Para qualquer assunto de privacidade,
              inclusive falar com o encarregado pelo tratamento de dados, escreva para {mail}.
            </p>
          ),
        },
        {
          id: 'dados',
          title: 'Quais dados tratamos',
          body: (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Dado</th>
                    <th>De onde vem</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Nome, e-mail e senha (guardada só como hash, com Argon2id)</td>
                    <td>Você, no cadastro</td>
                  </tr>
                  <tr>
                    <td>
                      Nome, e-mail e foto da sua conta Google, GitHub ou LinkedIn, se você entrar
                      por um deles. Não guardamos as chaves de acesso a essas contas
                    </td>
                    <td>O provedor, com a sua autorização</td>
                  </tr>
                  <tr>
                    <td>
                      Currículo e PDF do perfil do LinkedIn, e o que tiramos deles: experiências,
                      formação, competências, projetos, idiomas e resultados
                    </td>
                    <td>Documentos que você envia</td>
                  </tr>
                  <tr>
                    <td>
                      Título, resumo, links profissionais, objetivos de carreira, locais e pretensão
                      salarial
                    </td>
                    <td>Você, no perfil</td>
                  </tr>
                  <tr>
                    <td>
                      Currículos gerados, correções que você faz neles, cartas, respostas de
                      formulário, vagas salvas, candidaturas e avaliações de vagas
                    </td>
                    <td>O uso do LinkedIner</td>
                  </tr>
                  <tr>
                    <td>Plano, situação da assinatura e identificadores do cliente na Stripe</td>
                    <td>A Stripe, quando você assina</td>
                  </tr>
                  <tr>
                    <td>
                      Registros de segurança e de uso, como login e ações realizadas, com o endereço
                      IP guardado só de forma irreversível (hash)
                    </td>
                    <td>O uso do LinkedIner</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Não pedimos e não queremos dados sensíveis, como origem racial, religião, saúde,
                orientação sexual ou deficiência. Idade, gênero e dados desse tipo não entram no
                score nem na compatibilidade com as vagas. O número do cartão é digitado só na
                página da Stripe e nunca passa por nós.
              </p>
            </>
          ),
        },
        {
          id: 'finalidades',
          title: 'Para que usamos e com qual base legal',
          body: (
            <table>
              <thead>
                <tr>
                  <th>Finalidade</th>
                  <th>Base legal (LGPD, art. 7º)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    Criar e manter a sua conta, montar o perfil, calcular o score, gerar e exportar
                    currículos e organizar candidaturas
                  </td>
                  <td>Execução do contrato (inciso V)</td>
                </tr>
                <tr>
                  <td>Enviar textos ao provedor de IA para análise e geração de material</td>
                  <td>Consentimento (inciso I), que você pode retirar</td>
                </tr>
                <tr>
                  <td>Cobrar a assinatura e emitir os documentos fiscais</td>
                  <td>Execução do contrato e obrigação legal (incisos V e II)</td>
                </tr>
                <tr>
                  <td>
                    Proteger contas, evitar abuso e medir o uso do produto de forma agregada para
                    melhorá-lo
                  </td>
                  <td>Legítimo interesse (inciso IX)</td>
                </tr>
              </tbody>
            </table>
          ),
        },
        {
          id: 'ia',
          title: 'Inteligência artificial',
          body: (
            <>
              <p>
                A análise do currículo, a geração de currículos e o material por vaga usam um modelo
                de IA de terceiros (hoje, o Gemini, do Google). Isso só acontece se você autorizar o
                processamento por IA, e a autorização pode ser retirada a qualquer momento. Sem ela,
                essas funções ficam desligadas.
              </p>
              <ul>
                <li>
                  Enviamos só o necessário: o texto do documento ou da vaga, sem e-mail e sem
                  telefone, que retiramos antes do envio.
                </li>
                <li>
                  Não usamos os seus dados para treinar modelos de IA. O provedor processa os dados
                  em nosso nome, para responder a cada pedido.
                </li>
                <li>
                  A IA não pode inventar fatos sobre você. Tudo o que ela escreve é conferido com os
                  seus documentos, e o que não se comprova aparece como sugestão, que só entra no
                  material se você confirmar.
                </li>
                <li>
                  Quando você corrige uma frase gerada, guardamos a versão original junto com a sua,
                  para que os próximos currículos sigam o seu estilo.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'compartilhamento',
          title: 'Com quem compartilhamos',
          body: (
            <>
              <p>Não vendemos dados pessoais. Compartilhamos apenas com:</p>
              <ul>
                <li>
                  <strong>Prestadores de serviço</strong> que tratam os dados em nosso nome:
                  provedor de IA (Google), pagamentos (Stripe), hospedagem, banco de dados,
                  armazenamento de arquivos e envio de e-mails.
                </li>
                <li>
                  <strong>Empresas das vagas</strong>, e só o que você aprovar em cada candidatura.
                  Nada é enviado sem a sua aprovação.
                </li>
                <li>
                  <strong>Autoridades</strong>, quando a lei ou uma ordem judicial exigir.
                </li>
              </ul>
              <p>
                Alguns desses prestadores ficam fora do Brasil, como o Google e a Stripe. Nesses
                casos, a transferência internacional segue o art. 33 da LGPD, com contratos que
                exigem proteção equivalente.
              </p>
            </>
          ),
        },
        {
          id: 'retencao',
          title: 'Por quanto tempo guardamos',
          body: (
            <ul>
              <li>
                <strong>Documentos enviados</strong> (currículo e PDF do LinkedIn): até 30 dias. O
                texto extraído deles e os dados derivados saem junto.
              </li>
              <li>
                <strong>Perfil, currículos, vagas e candidaturas</strong>: enquanto a sua conta
                existir, ou até você apagar.
              </li>
              <li>
                <strong>Conta excluída</strong>: os dados são apagados, e a chave que protege os
                seus dados é destruída. Assim, até as cópias de segurança ficam ilegíveis.
              </li>
              <li>
                <strong>Registros de auditoria e de cobrança</strong>: mantidos pelo prazo exigido
                em lei, sem ligação direta com você depois da exclusão da conta.
              </li>
            </ul>
          ),
        },
        {
          id: 'seguranca',
          title: 'Como protegemos',
          body: (
            <ul>
              <li>
                Os dados do seu perfil e dos seus documentos são cifrados com uma chave só sua.
              </li>
              <li>
                A sessão fica num cookie que o navegador não expõe a scripts, e você pode sair a
                qualquer momento.
              </li>
              <li>
                Cada pessoa só acessa os próprios dados, e isso também é garantido no banco de
                dados.
              </li>
              <li>Os registros técnicos não guardam dados pessoais.</li>
            </ul>
          ),
        },
        {
          id: 'direitos',
          title: 'Seus direitos e como exercê-los',
          body: (
            <>
              <p>Pela LGPD (art. 18), você pode:</p>
              <ul>
                <li>confirmar se tratamos os seus dados e ter acesso a eles;</li>
                <li>corrigir dados incompletos ou errados, o que você mesmo faz no perfil;</li>
                <li>receber uma cópia dos seus dados em formato aberto (portabilidade);</li>
                <li>pedir a exclusão dos dados e da conta;</li>
                <li>retirar o consentimento para a análise por IA;</li>
                <li>saber com quem compartilhamos os seus dados;</li>
                <li>
                  reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em{' '}
                  <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">
                    gov.br/anpd
                  </a>
                  .
                </li>
              </ul>
              <p>
                Para qualquer pedido, escreva para {mail}. Respondemos em até 15 dias, como prevê a
                lei.
              </p>
            </>
          ),
        },
        {
          id: 'cookies',
          title: 'Cookies',
          body: (
            <p>
              Usamos apenas cookies essenciais, para manter você conectado e proteger a sessão. Não
              usamos cookies de publicidade nem de rastreamento de terceiros.
            </p>
          ),
        },
        {
          id: 'idade',
          title: 'Idade mínima',
          body: (
            <p>
              O LinkedIner é destinado a maiores de 18 anos. Se soubermos que uma conta pertence a
              alguém mais novo, ela será excluída.
            </p>
          ),
        },
        {
          id: 'mudancas',
          title: 'Mudanças nesta política',
          body: (
            <p>
              Quando esta política mudar de forma relevante, a versão muda, e você precisa ler e
              aceitar a nova versão para continuar usando o LinkedIner. A data da última atualização
              fica no topo da página.
            </p>
          ),
        },
      ]}
    />
  );
}
