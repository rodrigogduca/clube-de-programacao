import { dentroDoEscopo, escopoDeSetor, VE_TODOS_OS_SETORES } from './escopo';

/**
 * A regra que decide quem enxerga o quê.
 *
 * Vale um teste porque e uma regra de permissao expressa como dado: um cargo
 * entrando ou saindo de `VE_TODOS_OS_SETORES` muda silenciosamente o alcance de
 * tres telas e de duas APIs, e nada no compilador reclamaria.
 */
describe('escopoDeSetor', () => {
  it('nao restringe quem enxerga o clube inteiro', () => {
    for (const cargo of VE_TODOS_OS_SETORES) {
      expect(escopoDeSetor({ cargo, setorId: 7 })).toBeNull();
    }
  });

  it('o diretor fica preso ao proprio setor', () => {
    expect(escopoDeSetor({ cargo: 'diretor', setorId: 3 })).toEqual({
      setorId: 3,
    });
  });

  /* O diretor sem setor e cadastro incompleto, nao motivo para tela morta:
     ele cai no balde "sem setor", que e literalmente o setor dele. */
  it('diretor sem setor cai no balde sem setor, e nao em "ve tudo"', () => {
    expect(escopoDeSetor({ cargo: 'diretor', setorId: null })).toEqual({
      setorId: null,
    });
    expect(escopoDeSetor({ cargo: 'diretor' })).toEqual({ setorId: null });
  });

  it('membro comum tambem e restrito', () => {
    expect(escopoDeSetor({ cargo: 'membro', setorId: 2 })).toEqual({
      setorId: 2,
    });
  });

  /* Sem cargo nao ha sessao valida; quem barra isso e o guard, e nao esta
     funcao. Ela devolve `null` para nao inventar uma restricao a partir de um
     dado ausente. */
  it('sem cargo nao inventa restricao', () => {
    expect(escopoDeSetor({})).toBeNull();
    expect(escopoDeSetor({ cargo: null })).toBeNull();
  });
});

describe('dentroDoEscopo', () => {
  it('escopo nulo aceita qualquer setor', () => {
    expect(dentroDoEscopo(null, 1)).toBe(true);
    expect(dentroDoEscopo(null, null)).toBe(true);
  });

  it('aceita so o setor exato', () => {
    const escopo = { setorId: 3 };
    expect(dentroDoEscopo(escopo, 3)).toBe(true);
    expect(dentroDoEscopo(escopo, 4)).toBe(false);
    expect(dentroDoEscopo(escopo, null)).toBe(false);
  });

  /* `undefined` e `null` significam a mesma coisa aqui — "sem setor" —, e o
     Prisma devolve `null` enquanto um objeto parcial devolve `undefined`.
     Trata-los diferente deixaria a checagem passar ou falhar conforme a
     origem do dado. */
  it('trata ausencia de setor como um valor so', () => {
    const semSetor = { setorId: null };
    expect(dentroDoEscopo(semSetor, null)).toBe(true);
    expect(dentroDoEscopo(semSetor, undefined)).toBe(true);
    expect(dentroDoEscopo(semSetor, 1)).toBe(false);
  });
});
