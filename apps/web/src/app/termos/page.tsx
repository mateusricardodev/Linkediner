import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '../../components/legal-page';
import { LEGAL } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Termos de Uso · LinkedIner',
  description:
    'As regras de uso do LinkedIner: o que o serviço faz, o que não promete e como funcionam os planos.',
};

const mail = <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>;

/** Ao mudar o que estes termos descrevem, mude o texto e a versão (lib/legal.ts). */
export default function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      intro={
        <p>
          Estes termos são o acordo entre você e {LEGAL.controller}
          {LEGAL.document ? `, ${LEGAL.document}` : ''}, responsável pelo LinkedIner. Ao criar uma
          conta, você declara que leu e aceita estes termos e a{' '}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      }
      sections={[
        {
          id: 'servico',
          title: 'O que é o LinkedIner',
          body: (
            <p>
              O LinkedIner é um assistente de carreira para profissionais de tecnologia. Ele lê o
              seu currículo, mostra o que pode melhorar no seu perfil, gera currículos e material
              para cada vaga, compara o seu perfil com vagas e ajuda a organizar as suas
              candidaturas.
            </p>
          ),
        },
        {
          id: 'sem-garantia',
          title: 'O que o LinkedIner não promete',
          body: (
            <ul>
              <li>
                <strong>Não garantimos entrevista nem contratação.</strong> A decisão é sempre de
                quem contrata.
              </li>
              <li>
                O score do perfil, a conferência ATS e a compatibilidade com as vagas medem a
                preparação do seu perfil. Eles não indicam a sua chance de ser contratado.
              </li>
              <li>
                As vagas vêm de fontes públicas e de quem as publicou. Não somos responsáveis pelo
                conteúdo, pela existência da vaga nem pelo processo seletivo de cada empresa.
              </li>
            </ul>
          ),
        },
        {
          id: 'conta',
          title: 'Sua conta',
          body: (
            <ul>
              <li>Você precisa ter pelo menos 18 anos.</li>
              <li>
                As informações do cadastro devem ser verdadeiras, e a conta é pessoal: não a
                compartilhe.
              </li>
              <li>
                Você é responsável por manter a sua senha em segurança e por avisar a gente se
                suspeitar de uso indevido.
              </li>
            </ul>
          ),
        },
        {
          id: 'conteudo',
          title: 'Seu conteúdo e a veracidade das informações',
          body: (
            <>
              <p>
                Os documentos e as informações que você envia continuam sendo seus. Você nos
                autoriza a tratá-los só para prestar o serviço, como descrito na Política de
                Privacidade.
              </p>
              <p>
                O LinkedIner sugere textos, mas <strong>você decide o que vai no currículo</strong>.
                Frases que não aparecem nos seus documentos são marcadas como sugestão e só entram
                se você confirmar. Ao confirmar, aprovar ou enviar um material, você declara que ele
                é verdadeiro e é responsável por ele.
              </p>
            </>
          ),
        },
        {
          id: 'uso',
          title: 'Uso permitido',
          body: (
            <>
              <p>Não é permitido:</p>
              <ul>
                <li>enviar documentos ou dados de outras pessoas sem autorização delas;</li>
                <li>usar o LinkedIner para criar informações falsas sobre a sua experiência;</li>
                <li>
                  acessar o serviço por robôs, coletar dados dele ou tentar burlar limites, a
                  segurança ou o acesso de outras contas;
                </li>
                <li>usar o serviço para qualquer fim ilegal.</li>
              </ul>
              <p>
                Podemos suspender ou encerrar contas que descumpram estas regras, avisando o motivo
                sempre que a lei permitir.
              </p>
            </>
          ),
        },
        {
          id: 'candidaturas',
          title: 'Candidaturas',
          body: (
            <p>
              Nenhuma candidatura é enviada sem a sua aprovação. Quando a empresa usa um sistema
              próprio, o LinkedIner prepara o material e o passo a passo, e você conclui o envio no
              site da empresa.
            </p>
          ),
        },
        {
          id: 'planos',
          title: 'Planos e pagamento',
          body: (
            <ul>
              <li>
                O plano gratuito tem limites mensais de uso. Os planos pagos ampliam esses limites e
                incluem funções extras, como vagas encontradas automaticamente.
              </li>
              <li>
                Os planos pagos são cobrados todo mês pela Stripe e renovados automaticamente até
                você cancelar.
              </li>
              <li>
                Você pode cancelar quando quiser. O plano continua valendo até o fim do período já
                pago, e depois a conta volta para o gratuito, sem perder os seus dados.
              </li>
              <li>
                Você pode desistir da contratação em até 7 dias, com reembolso integral, como prevê
                o art. 49 do Código de Defesa do Consumidor. Peça pelo e-mail {mail}.
              </li>
              <li>
                Preços e limites podem mudar. Avisaremos com antecedência, e a mudança só vale a
                partir do período seguinte.
              </li>
            </ul>
          ),
        },
        {
          id: 'propriedade',
          title: 'Propriedade intelectual',
          body: (
            <p>
              A marca, o software e o design do LinkedIner pertencem ao responsável pelo serviço. O
              conteúdo dos seus currículos e materiais é seu, e você pode usá-lo livremente.
            </p>
          ),
        },
        {
          id: 'responsabilidade',
          title: 'Disponibilidade e responsabilidade',
          body: (
            <p>
              Trabalhamos para manter o serviço disponível e seguro, mas ele pode ter interrupções
              para manutenção ou por falhas de terceiros. Na medida permitida pela lei, não
              respondemos por decisões de recrutadores ou empresas, nem por conteúdo de vagas e
              sites de terceiros.
            </p>
          ),
        },
        {
          id: 'encerramento',
          title: 'Encerramento da conta',
          body: (
            <p>
              Você pode encerrar a sua conta quando quiser, pedindo pelo e-mail {mail}. Os dados são
              apagados como descrito na Política de Privacidade.
            </p>
          ),
        },
        {
          id: 'mudancas',
          title: 'Mudanças nestes termos',
          body: (
            <p>
              Quando estes termos mudarem de forma relevante, a versão muda, e você precisa ler e
              aceitar a nova versão para continuar usando o LinkedIner.
            </p>
          ),
        },
        {
          id: 'lei',
          title: 'Lei e foro',
          body: (
            <p>
              Estes termos seguem as leis brasileiras. Fica eleito o foro de {LEGAL.city}, sem
              prejuízo do seu direito, como consumidor, de propor ação no foro do seu domicílio.
              Dúvidas: {mail}.
            </p>
          ),
        },
      ]}
    />
  );
}
