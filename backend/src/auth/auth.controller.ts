import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { SessionRequest } from './session-request';
import { addFlash } from '../common/flash';

/** Aceita apenas caminhos internos, para o `?next=` nao virar open redirect. */
function safeNext(next: string | undefined, fallback: string) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return fallback;
  }
  return next;
}

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * `/accounts/login` e a rota usada pelos templates (herdada do Django);
   * `/auth/login` continua valendo para nao quebrar integracoes existentes.
   */
  @Post(['accounts/login', 'auth/login'])
  async login(
    @Body() dto: LoginDto,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    try {
      await this.authService.login(dto, req);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await addFlash(req, 'error', 'Usuario ou senha incorretos.');
        const next = dto.next ? `?next=${encodeURIComponent(dto.next)}` : '';
        res.redirect(303, `/accounts/login${next}`);
        return;
      }
      throw error;
    }

    res.redirect(303, safeNext(dto.next, '/painel'));
  }

  @Post(['accounts/logout', 'auth/logout'])
  logout(@Req() req: SessionRequest, @Res() res: Response) {
    this.authService.logout(req);
    res.redirect(303, '/');
  }

  @Get('auth/me')
  @HttpCode(HttpStatus.OK)
  getMe(@Req() req: SessionRequest) {
    return this.authService.getMe(req);
  }
}
