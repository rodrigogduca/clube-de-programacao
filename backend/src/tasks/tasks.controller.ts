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
import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsDateString,
} from 'class-validator';
import { TasksService } from './tasks.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { parseRouteId } from '../common/form';
import type { AuthenticatedRequest } from '../auth/session-request';

class CreateTaskDto {
  @IsString()
  titulo: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsInt()
  responsavelId: number;

  @IsOptional()
  @IsDateString()
  prazo?: string;

  @IsOptional()
  @IsIn(['baixa', 'media', 'alta', 'urgente'])
  prioridade?: string;

  @IsOptional()
  @IsIn([
    'design',
    'desenvolvimento',
    'marketing',
    'gestao',
    'pesquisa',
    'outro',
  ])
  funcao?: string;

  @IsOptional()
  @IsString()
  projeto?: string;

  @IsOptional()
  @IsIn(['pendente', 'em_andamento', 'concluida'])
  status?: string;
}

class UpdateTaskDto {
  @IsOptional()
  @IsString()
  titulo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsInt()
  responsavelId?: number;

  @IsOptional()
  @IsDateString()
  prazo?: string;

  @IsOptional()
  @IsIn(['baixa', 'media', 'alta', 'urgente'])
  prioridade?: string;

  @IsOptional()
  @IsIn([
    'design',
    'desenvolvimento',
    'marketing',
    'gestao',
    'pesquisa',
    'outro',
  ])
  funcao?: string;

  @IsOptional()
  @IsString()
  projeto?: string;

  @IsOptional()
  @IsIn(['pendente', 'em_andamento', 'concluida'])
  status?: string;
}

class UpdateStatusDto {
  @IsIn(['pendente', 'em_andamento', 'concluida'])
  status: string;
}

@Controller('tasks')
@UseGuards(AuthenticatedGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Get()
  async list() {
    return this.tasksService.list();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.tasksService.getById(parseRouteId(id, 'tarefa'));
  }

  /**
   * Anexos da tarefa, para a aba do pop-up de leitura.
   *
   * Vive sob /tasks porque anexo nao existe fora de uma tarefa, e o getById
   * vem antes de proposito: sem ele, um id inexistente devolveria uma lista
   * vazia em 200 em vez de 404.
   */
  @Get(':id/anexos')
  async anexos(@Param('id') id: string) {
    const tarefaId = parseRouteId(id, 'tarefa');
    await this.tasksService.getById(tarefaId);
    return this.attachmentsService.listByTask(tarefaId);
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() dto: CreateTaskDto, @Req() req: AuthenticatedRequest) {
    return this.tasksService.create(
      {
        titulo: dto.titulo,
        descricao: dto.descricao,
        responsavelId: dto.responsavelId,
        criadoPorId: req.membro.id,
        prazo: dto.prazo ? new Date(dto.prazo) : undefined,
        prioridade: dto.prioridade,
        funcao: dto.funcao,
        projeto: dto.projeto,
        status: dto.status,
      },
      req.membro,
    );
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.update(
      parseRouteId(id, 'tarefa'),
      {
        titulo: dto.titulo,
        descricao: dto.descricao,
        responsavelId: dto.responsavelId,
        prazo: dto.prazo ? new Date(dto.prazo) : undefined,
        prioridade: dto.prioridade,
        funcao: dto.funcao,
        projeto: dto.projeto,
        status: dto.status,
      },
      req.membro,
    );
  }

  @Patch(':id/status')
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.updateStatus(
      parseRouteId(id, 'tarefa'),
      dto.status,
      req.membro,
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.tasksService.delete(
      parseRouteId(id, 'tarefa'),
      req.membro,
    );
  }
}
