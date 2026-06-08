import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { PublicSession, Stored, User } from '@miracle/types';
import { UsersService } from './users.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { DeleteUserSessionsDto } from './dto/delete-user-sessions.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
export class UsersController {
    constructor(
        private readonly users: UsersService,
        private readonly sessions: SessionsService,
    ) {}

    @Get('me')
    @UseGuards(AuthGuard)
    getMe(@CurrentUser() user: AuthenticatedUser): Promise<Stored<User>> {
        return this.users.getPublicById(user.id);
    }

    // Только админ — переезд старого GET /admin/users.
    @Get()
    @UseGuards(AuthGuard, AdminGuard)
    list(): Promise<Stored<User>[]> {
        return this.users.listPublic();
    }

    // Только админ — переезд старого POST /admin/users.
    @Post()
    @UseGuards(AuthGuard, AdminGuard)
    create(@Body() dto: CreateUserDto): Promise<Stored<User>> {
        return this.users.createUser(dto);
    }

    @Get(':id/sessions')
    @UseGuards(AuthGuard, AdminGuard)
    listSessions(@Param('id') id: string): Promise<Stored<PublicSession>[]> {
        return this.sessions.listPublicByUserId(id);
    }

    @Delete(':id/sessions/all')
    @HttpCode(204)
    @UseGuards(AuthGuard, AdminGuard)
    async deleteAllSessions(@Param('id') id: string): Promise<void> {
        await this.sessions.deleteAllForUser(id);
    }

    @Delete(':id/sessions')
    @HttpCode(204)
    @UseGuards(AuthGuard, AdminGuard)
    async deleteSessions(
        @Param('id') id: string,
        @Body() dto: DeleteUserSessionsDto,
    ): Promise<void> {
        await this.sessions.deleteByIdsForUser(id, dto.ids);
    }

    @Patch(':id')
    @UseGuards(AuthGuard, AdminGuard)
    update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<Stored<User>> {
        return this.users.updateUser(id, dto);
    }

    // Публичный (без AuthGuard) — переезд старого GET /user/:id.
    @Get(':id')
    getById(@Param('id') id: string): Promise<Stored<User>> {
        return this.users.getPublicById(id);
    }
}
