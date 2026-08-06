import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Cargo } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../database/prisma.service';
import type { SessionRequest } from '../auth/session-request';

export const ROLES_KEY = 'clube:roles';

/** Restringe a rota aos cargos informados. Use junto com o AuthenticatedGuard. */
export const Roles = (...cargos: Cargo[]) => SetMetadata(ROLES_KEY, cargos);

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membersService: MembersService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SessionRequest>();

    if (!req.session?.userId) {
      throw new UnauthorizedException('Você precisa entrar para continuar.');
    }

    // Invalida sessoes emitidas antes de uma revogacao (troca de senha, banimento).
    const user = await this.prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { isActive: true, sessionVersion: true },
    });

    if (
      !user ||
      !user.isActive ||
      user.sessionVersion !== req.session.sessionVersion
    ) {
      req.session.destroy();
      throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    }

    const membro = await this.membersService.getByUserId(req.session.userId);
    if (!membro) {
      throw new ForbiddenException(
        'Sua conta ainda não possui um perfil de membro. Fale com a diretoria.',
      );
    }
    req.membro = membro;

    const required = this.reflector.getAllAndOverride<Cargo[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (required?.length && !required.includes(membro.cargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar esta área.',
      );
    }

    return true;
  }
}
