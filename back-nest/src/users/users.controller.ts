import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { Stored, User } from '@miracle/types';
import { UsersService } from './users.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';

@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get('me')
    @UseGuards(AuthGuard)
    getMe(@CurrentUser() user: AuthenticatedUser): Stored<User> {
        return this.users.getPublicById(user.id);
    }

    // Публичный (без AuthGuard) — переезд старого GET /user/:id.
    @Get(':id')
    getById(@Param('id') id: string): Stored<User> {
        return this.users.getPublicById(id);
    }
}
