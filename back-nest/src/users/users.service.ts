import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { USER_ROLES, type Stored, type User, type UserRole } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import type { UserInternal } from '../database/collections.js';
import { TokensService } from '../tokens/tokens.service.js';

export type CreateUserInput = {
    login: string;
    password: string;
    role?: UserRole;
};

@Injectable()
export class UsersService {
    constructor(
        private readonly db: DatabaseService,
        private readonly tokens: TokensService,
    ) {}

    getPublicById(id: string): Stored<User> {
        const user = this.db.collections.users.getById(id);
        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }

        return this.toPublic(user);
    }

    listPublic(): Stored<User>[] {
        return this.db.collections.users.list().map((user) => this.toPublic(user));
    }

    async createUser(input: CreateUserInput): Promise<Stored<User>> {
        const existing = this.db.collections.users
            .ref()
            .find((user) => user.login === input.login);
        if (existing) {
            throw new ConflictException(`Login "${input.login}" is already taken`);
        }

        const hashedPassword = await this.tokens.hashPassword(input.password);
        const created = await this.db.collections.users.create({
            login: input.login,
            password: hashedPassword,
            role: input.role ?? USER_ROLES.EMPLOYEE,
        });

        return this.toPublic(created);
    }

    private toPublic(user: Stored<UserInternal>): Stored<User> {
        const { password: _password, ...publicUser } = user;
        return publicUser as Stored<User>;
    }
}
