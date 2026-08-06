import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { MembersModule } from '../members/members.module';
import { SectorsModule } from '../sectors/sectors.module';
import { SignupRequestsModule } from '../signup-requests/signup-requests.module';
import { TasksModule } from '../tasks/tasks.module';
import { PageContextService } from './page-context.service';
import { PanelController } from './panel.controller';
import { PublicPagesController } from './public-pages.controller';
import { SignupPagesController } from './signup-pages.controller';

@Module({
  imports: [
    MembersModule,
    SectorsModule,
    TasksModule,
    SignupRequestsModule,
    AttachmentsModule,
  ],
  controllers: [PublicPagesController, PanelController, SignupPagesController],
  providers: [PageContextService],
})
export class PagesModule {}
