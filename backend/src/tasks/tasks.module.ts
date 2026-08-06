import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksCsvService } from './tasks-csv.service';
import { TasksService } from './tasks.service';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  // O modulo attachments so tem service. A listagem em JSON entra aqui, sob
  // /tasks/:id/anexos, porque anexo nao existe fora de uma tarefa.
  imports: [AttachmentsModule],
  controllers: [TasksController],
  providers: [TasksService, TasksCsvService],
  exports: [TasksService, TasksCsvService],
})
export class TasksModule {}
