import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from './password.service';
import type { SessionRequest } from './session-request';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async login(dto: LoginDto, req: SessionRequest) {
    const identifier = dto.identifier.trim();
    const user = await this.prismaService.user.findFirst({
      where: {
        OR: [
          {
            username: {
              equals: identifier,
              mode: 'insensitive',
            },
          },
          {
            email: {
              equals: identifier,
              mode: 'insensitive',
            },
          },
        ],
      },
      include: {
        member: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario ou senha incorretos.');
    }

    const { valid, newHash } = await this.passwordService.verifyAndUpgrade(
      dto.password,
      user.passwordHash,
    );

    if (!valid) {
      throw new UnauthorizedException('Usuario ou senha incorretos.');
    }

    if (newHash) {
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
    }

    await this.prismaService.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    req.session.userId = user.id;
    req.session.role = user.member?.cargo;
    req.session.sessionVersion = user.sessionVersion;
    req.session.issuedAt = new Date().toISOString();
    // Novo token a cada login para evitar fixacao do token de CSRF.
    req.session.csrfToken = randomBytes(32).toString('hex');
    await req.session.save();

    return { ok: true };
  }

  logout(req: SessionRequest) {
    req.session.destroy();
    return { ok: true };
  }

  getMe(req: SessionRequest) {
    if (!req.session.userId) {
      return null;
    }

    return {
      userId: req.session.userId,
      role: req.session.role ?? null,
      sessionVersion: req.session.sessionVersion ?? null,
    };
  }
}
