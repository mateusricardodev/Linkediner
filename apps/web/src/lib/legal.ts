/**
 * Dados dos Termos de Uso e da Política de Privacidade.
 *
 * A versão precisa ser a mesma de CURRENT_CONSENT_VERSIONS (packages/core/src/modules/privacy):
 * ao mudar um texto, troque a versão nos dois lugares, e quem aceitou a anterior aceita de novo.
 * Textos sem revisão jurídica (ADR 0027): revisar antes de abrir para usuários reais.
 */
export const LEGAL = {
  version: '2026-11-v2',
  updatedAt: '9 de novembro de 2026',
  /** Quem decide sobre os dados (controlador, LGPD art. 5º, VI): empresa e CNPJ, ou pessoa. */
  controller: 'Mateus Ricardo dos Santos',
  /**
   * CNPJ da empresa. Vazio enquanto o responsável é pessoa física: o CPF não vai para uma página
   * pública, porque nome e canal de contato bastam para identificar o controlador.
   */
  document: '' as string,
  /** Canal para pedidos de privacidade e contato com o encarregado (LGPD art. 41). */
  privacyEmail: 'mateus.ricardo761919@gmail.com',
  /** Foro para disputas. */
  city: 'São José dos Campos/SP',
} as const;
