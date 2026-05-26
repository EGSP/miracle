import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { SessionsService, type CookieSessionResponse } from './sessions.service.js';

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
    constructor(private readonly sessions: SessionsService) {}

    @Get('cookie')
    getCookieSession(@CurrentUser() user: AuthenticatedUser): CookieSessionResponse {
        return this.sessions.getCookieSession(user);
    }
}
