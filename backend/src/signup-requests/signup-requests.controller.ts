import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsOptional, IsIn, IsInt, MinLength } from 'class-validator';
import { SignupRequestsService } from './signup-requests.service';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { parseRouteId } from '../common/form';
import type { AuthenticatedRequest } from '../auth/session-request';

class CreateSignupDto {
  @IsString()
  username: string;

  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  email: string;

  @IsOptional()
  @IsInt()
  setorId?: number;

  @IsOptional()
  @IsIn([
    'presidente',
    'vice_presidente',
    'administrador',
    'diretor',
    'antiga_gestao',
    'membro',
  ])
  cargo?: string;

  @IsString()
  @MinLength(8)
  senha: string;
}

@Controller('signup-requests')
export class SignupRequestsController {
  constructor(private readonly signupRequestsService: SignupRequestsService) {}

  @Get()
  @UseGuards(AuthenticatedGuard)
  async list(@Req() req: AuthenticatedRequest) {
    return this.signupRequestsService.list(req.membro);
  }

  @Get(':id')
  @UseGuards(AuthenticatedGuard)
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.signupRequestsService.getById(
      parseRouteId(id, 'solicitacao'),
      req.membro,
    );
  }

  /** Publico: e assim que alguem de fora pede acesso ao clube. */
  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() dto: CreateSignupDto) {
    return this.signupRequestsService.create({
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      setorId: dto.setorId,
      cargo: dto.cargo as any,
      senha: dto.senha,
    });
  }

  @Post(':id/aprovar')
  @UseGuards(AuthenticatedGuard)
  async approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.signupRequestsService.approve(
      parseRouteId(id, 'solicitacao'),
      req.session.userId!,
      req.membro,
    );
  }

  @Post(':id/rejeitar')
  @UseGuards(AuthenticatedGuard)
  async reject(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.signupRequestsService.reject(
      parseRouteId(id, 'solicitacao'),
      req.session.userId!,
      req.membro,
    );
  }

  @Delete(':id')
  @UseGuards(AuthenticatedGuard)
  async delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.signupRequestsService.delete(
      parseRouteId(id, 'solicitacao'),
      req.membro,
    );
  }
}
