/**
 * Horário da SEMCOMP, sempre no fuso de Salvador (-03:00, sem horário de
 * verão desde 2019).
 *
 * NÃO USAR O FILTRO `date` DO NUNJUCKS para horário de atividade: ele formata
 * no fuso do servidor, e a Vercel roda em UTC — a palestra das 09:00 sairia
 * "12:00". Aqui a conta é feita com o deslocamento fixo, e o resultado é o
 * mesmo em qualquer máquina.
 */
const DESLOCAMENTO_MS = -3 * 60 * 60 * 1000;

const SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

function local(data: Date) {
  return new Date(data.getTime() + DESLOCAMENTO_MS);
}

const dois = (n: number) => String(n).padStart(2, '0');

/** "09:00" */
export function hora(data: Date): string {
  const l = local(data);
  return `${dois(l.getUTCHours())}:${dois(l.getUTCMinutes())}`;
}

/** "2026-09-29" — a chave do dia, para agrupar. */
export function chaveDia(data: Date): string {
  const l = local(data);
  return `${l.getUTCFullYear()}-${dois(l.getUTCMonth() + 1)}-${dois(l.getUTCDate())}`;
}

/** "Terça, 29/09" */
export function rotuloDia(data: Date): string {
  const l = local(data);
  return `${SEMANA[l.getUTCDay()]}, ${dois(l.getUTCDate())}/${dois(l.getUTCMonth() + 1)}`;
}

/** "29/09/2026 às 09:00", para mensagens. */
export function dataHora(data: Date): string {
  const l = local(data);
  return `${dois(l.getUTCDate())}/${dois(l.getUTCMonth() + 1)}/${l.getUTCFullYear()} às ${hora(data)}`;
}

/** Valor para `<input type="date">` e `<input type="time">`. */
export function paraCampos(data: Date): { dia: string; hora: string } {
  return { dia: chaveDia(data), hora: hora(data) };
}

/** "2026-09-29" + "09:00" (horário de Salvador) -> instante. */
export function deCampos(dia: string, horaTexto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(horaTexto)) {
    return null;
  }
  const data = new Date(`${dia}T${horaTexto}:00-03:00`);
  return Number.isNaN(data.getTime()) ? null : data;
}
