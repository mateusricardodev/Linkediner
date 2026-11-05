import { describe, expect, it } from 'vitest';
import { redactSensitiveData } from './redact';

describe('redactSensitiveData', () => {
  it('remove e-mail, telefone e CPF', () => {
    const out = redactSensitiveData(
      'Contato: ana.lima+cv@exemplo.com.br | +55 (11) 91234-5678 | (21) 3456-7890 | 11 91234-5678 | CPF 123.456.789-09',
    );
    for (const value of ['ana.lima', '91234-5678', '3456-7890', '123.456.789-09']) {
      expect(out).not.toContain(value);
    }
  });

  it('remove linhas com atributos sensíveis, em português e inglês', () => {
    const out = redactSensitiveData(
      [
        'Data de nascimento: 01/02/1990',
        'Gênero: feminino',
        'Estado civil: casada',
        'Raça: parda',
        'Date of birth: Feb 1 1990',
        '  Endereço: Rua das Flores, 10',
        'Experiência',
      ].join('\n'),
    );
    for (const value of ['1990', 'feminino', 'casada', 'parda', 'Flores']) {
      expect(out).not.toContain(value);
    }
    expect(out).toContain('Experiência');
  });

  it('remove o nome do titular, inclusive com outra capitalização ou espaçamento', () => {
    const out = redactSensitiveData('ANA  LIMA\nEngenheira. Referência: Ana Lima', 'Ana Lima');
    expect(out).not.toMatch(/ana\s+lima/i);
    expect(out).toContain('Engenheira');
  });

  it('não apaga conteúdo profissional: anos, métricas e rótulos parecidos', () => {
    const text = [
      'Empresa X, 2019 - 2023',
      'Reduzi o tempo de build em 40% em 1200 pipelines',
      'Corporação: Empresa Y',
      'Agência de publicidade',
      'Stack: React, TypeScript',
    ].join('\n');
    expect(redactSensitiveData(text)).toBe(text);
  });

  it('nome com uma só palavra não é usado, para não apagar palavras comuns', () => {
    expect(redactSensitiveData('Trabalhei com Mateus e Rust', 'Rust')).toContain('Rust');
  });

  it('nome com caracteres especiais não quebra a remoção', () => {
    expect(redactSensitiveData('Ana (Lima) Souza', 'Ana (Lima) Souza')).toBe('[REMOVIDO]');
  });
});
