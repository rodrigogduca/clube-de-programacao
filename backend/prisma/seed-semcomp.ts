/**
 * Carrega no banco as atividades CONFIRMADAS da SEMCOMP 2026 — as mesmas da
 * grade de `views/core/semcomp.njk` (planilha de logística da comissão).
 *
 *   npm run semcomp:seed
 *
 * Pode rodar quantas vezes quiser: atividade com o mesmo título no mesmo
 * horário não é criada de novo, e nada que já exista é alterado. Vagas,
 * sala e sessão do Even3 se ajustam depois pelo painel (/painel/semcomp).
 *
 * Cada bloco da grade dura 50 minutos (09:00–09:50, ...), como na página;
 * quem ocupa mais de um bloco diz os minutos no sexto campo.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Linha = [
  dia: string,
  hora: string,
  tipo: string,
  titulo: string,
  quem: string,
  minutos?: number,
];

// Planilha de logística atualizada em 23/09/2026. Entram só as CONFIRMADAS.
// O hackathon (30/09) fica de fora: tem portal próprio e é só para
// estudantes do CIMATEC, não se escolhe pelo formulário. O Capture The Leak
// é um bloco só, das 14:00 às 15:50.
const ATIVIDADES: Linha[] = [
  // 29/09 — Cimatec Day
  [
    '2026-09-29',
    '09:00',
    'Mesa redonda',
    'Protagonismo universitário: o impacto das iniciativas estudantis na graduação',
    'Jeangela',
  ],
  [
    '2026-09-29',
    '10:00',
    'Palestra',
    'Papel das iniciativas de extensão no contexto acadêmico e social',
    'Marinilda',
  ],
  [
    '2026-09-29',
    '11:00',
    'Palestra',
    'Saúde mental e vida universitária: estratégias para o equilíbrio emocional nos estudos',
    'NAAE',
  ],
  [
    '2026-09-29',
    '13:00',
    'Palestra',
    'Empreendedorismo jovem: acelere sua carreira no Movimento Empresa Júnior',
    'Cimatec Jr',
  ],
  [
    '2026-09-29',
    '14:00',
    'Mesa redonda',
    'Do campus ao mercado: o potencial do ecossistema de startups do SENAI CIMATEC',
    'Thomas Buck',
  ],
  [
    '2026-09-29',
    '15:00',
    'Palestra',
    'SENAI CIMATEC e big techs: como impulsionar sua carreira na era da inteligência artificial',
    'Sanval Ebert',
  ],
  // 30/09 — Dev Day
  [
    '2026-09-30',
    '11:00',
    'Palestra',
    'Síndrome do impostor: estamos juntos nisso',
    'Prof. Antonio Pedro (FIAP)',
  ],
  [
    '2026-09-30',
    '17:00',
    'Palestra',
    'Indústria de games: criação, tecnologias e oportunidades no desenvolvimento de jogos na Bahia',
    'Clube de Jogos + BIND',
  ],
  // 01/10 — AI Day
  [
    '2026-10-01',
    '09:00',
    'Mesa redonda',
    'Indústria de jogos',
    'BIND + Clube de Jogos',
  ],
  [
    '2026-10-01',
    '10:00',
    'Palestra',
    'IA no contexto de trabalhos acadêmicos',
    'William Ferreira e Raissa',
  ],
  [
    '2026-10-01',
    '11:00',
    'Palestra',
    'Git & GitHub: a importância do versionamento de código',
    'Rian Dultra, Rafael Guerra e Victor Mendes',
  ],
  [
    '2026-10-01',
    '13:00',
    'Palestra',
    'Novas pesquisas e tecnologias no mundo VR, com acompanhamento ao vivo do SVR 2026',
    'Ingrid Winkler',
  ],
  [
    '2026-10-01',
    '15:00',
    'Palestra',
    'IA na indústria automotiva',
    'Anderson Dorea (Dortech)',
  ],
  // 02/10 — Cyber & Quantum Day
  [
    '2026-10-02',
    '10:00',
    'Palestra',
    'Impacto atual das tecnologias quantum safe na cibersegurança',
    'Henrique',
  ],
  [
    '2026-10-02',
    '11:00',
    'Palestra',
    'História da comunicação quântica',
    'Maria Heloísa',
  ],
  [
    '2026-10-02',
    '13:00',
    'Palestra',
    'IA para cibersegurança e cibersegurança para IA',
    'Jamson Borges, gerente de tecnologia da X Logic',
  ],
  [
    '2026-10-02',
    '14:00',
    'Capture The Leak',
    'Capture The Leak: caçada à ameaça interna com FortiDLP',
    'Robson Borges (Fortinet)',
    110,
  ],
  [
    '2026-10-02',
    '16:00',
    'Palestra',
    'Além da sala de aula: formação e experiência em cibersegurança',
    'Clube de Cyber',
  ],
];

async function main() {
  let criadas = 0;
  for (const [dia, hora, tipo, titulo, quem, minutos = 50] of ATIVIDADES) {
    const inicio = new Date(`${dia}T${hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + minutos * 60 * 1000);
    const existe = await prisma.semcompAtividade.findFirst({
      where: { inicio, titulo },
      select: { id: true },
    });
    if (existe) continue;
    await prisma.semcompAtividade.create({
      data: { tipo, titulo, quem, inicio, fim },
    });
    criadas++;
  }
  console.log(
    `${criadas} atividade(s) criada(s); ${ATIVIDADES.length - criadas} já existia(m).`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
