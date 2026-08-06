import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { SignupRequestsController } from './signup-requests.controller';
import { SignupRequestsService } from './signup-requests.service';

@Module({
  imports: [AuthModule, MembersModule],
  controllers: [SignupRequestsController],
  providers: [SignupRequestsService],
  exports: [SignupRequestsService],
})
export class SignupRequestsModule {}
