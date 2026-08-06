import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsOptional, IsIn, IsInt } from 'class-validator';
import { MembersService } from './members.service';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { parseRouteId } from '../common/form';
import type { AuthenticatedRequest } from '../auth/session-request';

class CreateMemberDto {
  @IsInt()
  userId: number;

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

  @IsOptional()
  @IsInt()
  setorId?: number;

  @IsOptional()
  @IsString()
  bio?: string;
}

class UpdateMemberDto {
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

  @IsOptional()
  @IsInt()
  setorId?: number;

  @IsOptional()
  @IsString()
  bio?: string;
}

@Controller('members')
@UseGuards(AuthenticatedGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  async list() {
    return this.membersService.list();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.membersService.getById(parseRouteId(id, 'membro'));
  }

  /** Consumido pelo pop-up de perfil no diretorio de membros. */
  @Get(':id/tarefas')
  async tarefas(@Param('id') id: string, @Query('limite') limite?: string) {
    const pedido = Number(limite);
    const take = Number.isInteger(pedido) && pedido > 0 && pedido <= 50 ? pedido : 5;
    return this.membersService.listTarefasDoMembro(
      parseRouteId(id, 'membro'),
      take,
    );
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() dto: CreateMemberDto, @Req() req: AuthenticatedRequest) {
    return this.membersService.create(
      {
        userId: dto.userId,
        cargo: dto.cargo as any,
        setorId: dto.setorId,
        bio: dto.bio,
      },
      req.membro.cargo,
    );
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.membersService.update(
      parseRouteId(id, 'membro'),
      {
        cargo: dto.cargo as any,
        setorId: dto.setorId,
        bio: dto.bio,
      },
      req.membro.cargo,
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.membersService.delete(
      parseRouteId(id, 'membro'),
      req.membro.cargo,
    );
  }
}
