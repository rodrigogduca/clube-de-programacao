import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

/** O pedaço do transporte do nodemailer que se usa aqui (o pacote não traz tipos). */
type Transporter = {
  sendMail(opcoes: {
    from?: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
};

/**
 * ENVIO DE E-MAIL, pelo SMTP das variáveis `EMAIL_*` do `.env`.
 *
 * Primeiro uso de e-mail do sistema: até aqui as variáveis estavam
 * reservadas. Sem `EMAIL_HOST` nada é enviado e o link vai para o log —
 * que é o que se quer em desenvolvimento. Em produção isso é um problema, e
 * por isso quem acabou de se inscrever também vê o próprio link na tela de
 * confirmação (ver `SemcompPublicoController`).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');
  private transporte: Transporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  get ativo() {
    return Boolean(this.config.get<string>('EMAIL_HOST')?.trim());
  }

  private obterTransporte(): Transporter | null {
    if (this.transporte !== undefined) return this.transporte;
    if (!this.ativo) {
      this.transporte = null;
      return null;
    }
    const porta = Number(this.config.get<string>('EMAIL_PORT') || 587);
    this.transporte = (
      nodemailer as { createTransport(o: unknown): Transporter }
    ).createTransport({
      host: this.config.get<string>('EMAIL_HOST'),
      port: porta,
      secure: porta === 465,
      auth: {
        user: this.config.get<string>('EMAIL_USER'),
        pass: this.config.get<string>('EMAIL_PASSWORD'),
      },
    });
    return this.transporte;
  }

  /** Devolve `true` se o e-mail saiu. Nunca lança: e-mail é acessório. */
  async enviar(para: string, assunto: string, texto: string, html: string) {
    const transporte = this.obterTransporte();
    if (!transporte) {
      this.logger.warn(
        `SMTP não configurado; e-mail para ${para} não enviado.\n${texto}`,
      );
      return false;
    }
    try {
      await transporte.sendMail({
        from:
          this.config.get<string>('DEFAULT_FROM_EMAIL') ||
          this.config.get<string>('EMAIL_USER'),
        to: para,
        subject: assunto,
        text: texto,
        html,
      });
      return true;
    } catch (erro) {
      this.logger.error(
        `Falha ao enviar e-mail para ${para}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      return false;
    }
  }
}
