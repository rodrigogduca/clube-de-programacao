import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MembersModule } from '../members/members.module';
import { PageContextService } from '../pages/page-context.service';
import { SITE_LINKS } from '../pages/site-links';
import { SignupRequestsModule } from '../signup-requests/signup-requests.module';
import { EmailService } from './email.service';
import { Even3Service } from './even3.service';
import { SemcompPainelController } from './semcomp-painel.controller';
import { SemcompPublicoController } from './semcomp-publico.controller';
import { SemcompService } from './semcomp.service';

/**
 * INSCRIÇÃO PELO SITE DESLIGADA (`SITE_LINKS.semcompInscricaoPeloSite`
 * vazio): quem chegar por um link antigo ao formulário vai direto para o
 * Even3, e a área do painel volta para o painel. O código fica montado para
 * ser religado sem remendo.
 */
function inscricaoDesligada(req: Request, res: Response, next: NextFunction) {
  if (SITE_LINKS.semcompInscricaoPeloSite) {
    next();
    return;
  }
  if (req.path.startsWith('/painel')) {
    res.redirect(302, '/painel');
    return;
  }
  res.redirect(302, SITE_LINKS.semcomp || '/semcomp');
}

@Module({
  imports: [MembersModule, SignupRequestsModule],
  controllers: [SemcompPublicoController, SemcompPainelController],
  providers: [SemcompService, Even3Service, EmailService, PageContextService],
})
export class SemcompModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(inscricaoDesligada)
      .forRoutes(SemcompPublicoController, SemcompPainelController);
  }
}
