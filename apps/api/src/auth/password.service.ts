import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

const options = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  hash(password: string) {
    return hash(password, options);
  }

  async verify(storedHash: string | null, password: string) {
    if (!storedHash) return false;
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }
}
