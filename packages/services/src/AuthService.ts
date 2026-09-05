import argon2 from 'argon2';
import { AppError } from '@quill/shared';
import type { IUserRepository, UserRow } from '@quill/database';
import type { LoginData, RegisterData } from '@quill/shared';

export type UserPublic = Omit<UserRow, 'password_hash' | 'updated_at'>;

const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$' + 'A'.repeat(43);

export class AuthService {
  constructor(private readonly users: IUserRepository) {}

  async register(data: RegisterData): Promise<UserPublic> {
    const email = data.email.trim().toLowerCase();
    if (this.users.findByEmail(email)) {
      throw new AppError('EMAIL_TAKEN', 'Email is already registered', 409);
    }
    if (this.users.findByUsername(data.username)) {
      throw new AppError('USERNAME_TAKEN', 'Username is already registered', 409);
    }

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    return this.toPublic(this.users.create({
      username: data.username,
      email,
      password_hash: passwordHash,
    }));
  }

  async login(data: LoginData): Promise<UserPublic> {
    const user = this.users.findByEmail(data.email.trim().toLowerCase());
    const valid = await argon2.verify(user?.password_hash ?? DUMMY_HASH, data.password).catch(() => false);
    if (!user || !valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    return this.toPublic(user);
  }

  getUserById(id: number): UserPublic {
    const user = this.users.findById(id);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }
    return this.toPublic(user);
  }

  private toPublic(user: UserRow): UserPublic {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      bio: user.bio,
      created_at: user.created_at,
    };
  }
}