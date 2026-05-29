import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { Stored, User } from '@miracle/types';
import { UsersService } from './users.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { CreateUserDto } from './dto/create-user.dto.js';

@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get('me')
    @UseGuards(AuthGuard)
    getMe(@CurrentUser() user: AuthenticatedUser): Stored<User> {
        return this.users.getPublicById(user.id);
    }

    // Только админ — переезд старого GET /admin/users.
    @Get()
    @UseGuards(AuthGuard, AdminGuard)
    list(): Stored<User>[] {
        return this.users.listPublic();
    }

    // Только админ — переезд старого POST /admin/users.
    @Post()
    @UseGuards(AuthGuard, AdminGuard)
    create(@Body() dto: CreateUserDto): Promise<Stored<User>> {
        return this.users.createUser(dto);
    }

    // Публичный (без AuthGuard) — переезд старого GET /user/:id.
    @Get(':id')
    getById(@Param('id') id: string): Stored<User> {
        return this.users.getPublicById(id);
    }
}
