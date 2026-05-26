import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import type { PublicUserDto } from './dto/public-user.dto.js';

@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get('me')
    @UseGuards(AuthGuard)
    getMe(@CurrentUser() user: AuthenticatedUser): PublicUserDto {
        return this.users.getPublicById(user.id);
    }
}
