import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthModule } from './auth/auth.module';
import { buildSessionOptions } from './auth/session.options';
import { ironSessionMiddleware } from './auth/iron-session.middleware';
import { CommonModule } from './common/common.module';
import { csrfMiddleware } from './common/csrf.middleware';
import { DatabaseModule } from './database/database.module';
import { MembersModule } from './members/members.module';
import { PagesModule } from './pages/pages.module';
import { SectorsModule } from './sectors/sectors.module';
import { SignupRequestsModule } from './signup-requests/signup-requests.module';
import { TasksModule } from './tasks/tasks.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    PagesModule,
    MembersModule,
    SectorsModule,
    TasksModule,
    AttachmentsModule,
    SignupRequestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  constructor(private readonly configService: ConfigService) {}

  configure(consumer: MiddlewareConsumer) {
    // A ordem importa: a sessao precisa existir antes da checagem de CSRF.
    consumer
      .apply(
        ironSessionMiddleware(buildSessionOptions(this.configService)),
        csrfMiddleware(),
      )
      .forRoutes('*');
  }
}
