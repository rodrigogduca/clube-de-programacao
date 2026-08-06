import { BadRequestException } from '@nestjs/common';

export type FormBody = Record<string, unknown>;

/** Campos de formulario chegam sempre como string; "" significa "não informado". */
export function optionalText(
  body: FormBody,
  field: string,
): string | undefined {
  const value = body[field];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requiredText(
  body: FormBody,
  field: string,
  label: string,
): string {
  const value = optionalText(body, field);
  if (!value) {
    throw new BadRequestException(`O campo "${label}" e obrigatório.`);
  }
  return value;
}

/** Textareas podem ser esvaziadas de proposito, entao "" vira string vazia e nao undefined. */
export function optionalTextArea(
  body: FormBody,
  field: string,
): string | undefined {
  const value = body[field];
  return typeof value === 'string' ? value.trim() : undefined;
}

/** `<select>` vazio vira null (desvincular), valor preenchido vira numero. */
export function optionalId(
  body: FormBody,
  field: string,
  label: string,
): number | null | undefined {
  const value = body[field];
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`O campo "${label}" e inválido.`);
  }
  return parsed;
}

export function requiredId(
  body: FormBody,
  field: string,
  label: string,
): number {
  const parsed = optionalId(body, field, label);
  if (parsed == null) {
    throw new BadRequestException(`Selecione um valor para "${label}".`);
  }
  return parsed;
}

export function optionalDate(
  body: FormBody,
  field: string,
  label: string,
): Date | null | undefined {
  const value = optionalText(body, field);
  if (value === undefined) {
    return typeof body[field] === 'string' ? null : undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`A data em "${label}" e inválida.`);
  }
  return parsed;
}

export function optionalChoice<T extends string>(
  body: FormBody,
  field: string,
  allowed: readonly T[],
  label: string,
): T | undefined {
  const value = optionalText(body, field);
  if (value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    throw new BadRequestException(
      `A opcao escolhida em "${label}" e inválida.`,
    );
  }
  return value as T;
}

/** Converte o parametro de rota em id, recusando "abc" antes de chegar no banco. */
export function parseRouteId(raw: string, label = 'registro'): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`Identificador de ${label} inválido.`);
  }
  return parsed;
}
