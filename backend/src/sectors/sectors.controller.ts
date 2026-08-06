import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { SectorsService } from './sectors.service';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { parseRouteId } from '../common/form';
import type { AuthenticatedRequest } from '../auth/session-request';

class CreateSectorDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}

class UpdateSectorDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}

@Controller('sectors')
@UseGuards(AuthenticatedGuard)
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @Get()
  async list() {
    return this.sectorsService.list();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.sectorsService.getById(parseRouteId(id, 'setor'));
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() dto: CreateSectorDto, @Req() req: AuthenticatedRequest) {
    return this.sectorsService.create(
      { nome: dto.nome, descricao: dto.descricao },
      req.membro.cargo,
    );
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSectorDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sectorsService.update(
      parseRouteId(id, 'setor'),
      { nome: dto.nome, descricao: dto.descricao },
      req.membro.cargo,
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.sectorsService.delete(
      parseRouteId(id, 'setor'),
      req.membro.cargo,
    );
  }
}
