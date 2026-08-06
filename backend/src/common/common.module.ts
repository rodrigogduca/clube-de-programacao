import { Global, Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { AuthenticatedGuard } from './authenticated.guard';

/**
 * Disponibiliza o guard de autenticacao (e o MembersService de que ele depende)
 * para todos os modulos, sem repetir imports em cada um.
 */
@Global()
@Module({
  imports: [MembersModule],
  providers: [AuthenticatedGuard],
  exports: [AuthenticatedGuard, MembersModule],
})
export class CommonModule {}
