import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { USER_ROLES, type Stored, type User, type UserRole } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { TokensService } from '../tokens/tokens.service.js';

export type CreateUserInput = {
    login: string;
    password: string;
    role?: UserRole;
};

export type UpdateUserInput = {
    role?: UserRole;
};

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tokens: TokensService,
    ) {}

    async getPublicById(id: string): Promise<Stored<User>> {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }
        return this.toPublic(user);
    }

    async listPublic(): Promise<Stored<User>[]> {
        const users = await this.prisma.user.findMany();
        return users.map((u) => this.toPublic(u));
    }

    async createUser(input: CreateUserInput): Promise<Stored<User>> {
        const existing = await this.prisma.user.findFirst({ where: { login: input.login } });
        if (existing) {
            throw new ConflictException(`Login "${input.login}" is already taken`);
        }

        const hashedPassword = await this.tokens.hashPassword(input.password);
        const created = await this.prisma.user.create({
            data: {
                login: input.login,
                password: hashedPassword,
                role: (input.role ?? USER_ROLES.EMPLOYEE) as 'EMPLOYEE' | 'ADMIN',
            },
        });

        return this.toPublic(created);
    }

    async updateUser(id: string, input: UpdateUserInput): Promise<Stored<User>> {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }

        const updated = await this.prisma.user.update({
            where: { id },
            data: {
                ...(input.role !== undefined && {
                    role: input.role as 'EMPLOYEE' | 'ADMIN',
                }),
            },
        });

        return this.toPublic(updated);
    }

    private toPublic(user: { id: string; login: string; role: string; password: string | null; createdAt: Date; updatedAt: Date; deletedAt: Date | null }): Stored<User> {
        const { password: _password, ...rest } = user;
        return rest as Stored<User>;
    }
}
