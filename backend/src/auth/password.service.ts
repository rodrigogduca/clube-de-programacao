import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { pbkdf2Sync, timingSafeEqual } from 'crypto';

@Injectable()
export class PasswordService {
  private readonly bcryptRounds: number;

  constructor(private readonly configService: ConfigService) {
    const rounds = Number(
      this.configService.get<string>('BCRYPT_ROUNDS') ?? 12,
    );
    this.bcryptRounds = Number.isFinite(rounds) && rounds > 3 ? rounds : 12;
  }

  async verifyAndUpgrade(password: string, hash: string) {
    if (hash.startsWith('pbkdf2_sha256$')) {
      const valid = this.verifyDjangoPbkdf2(password, hash);
      if (!valid) {
        return { valid: false };
      }
      const newHash = await this.hashWithBcrypt(password);
      return { valid: true, newHash };
    }

    if (
      hash.startsWith('$2a$') ||
      hash.startsWith('$2b$') ||
      hash.startsWith('$2y$')
    ) {
      const valid = await bcrypt.compare(password, hash);
      return { valid };
    }

    return { valid: false };
  }

  private verifyDjangoPbkdf2(password: string, hash: string) {
    const parts = hash.split('$');
    if (parts.length !== 4) {
      return false;
    }

    const iterations = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations <= 0) {
      return false;
    }

    const salt = parts[2];
    const digest = parts[3];
    const derivedKey = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    const digestBuffer = Buffer.from(digest, 'base64');

    if (digestBuffer.length !== derivedKey.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, digestBuffer);
  }

  async hash(password: string) {
    return this.hashWithBcrypt(password);
  }

  private async hashWithBcrypt(password: string) {
    return bcrypt.hash(password, this.bcryptRounds);
  }
}
