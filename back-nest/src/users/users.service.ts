import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PublicUserDto } from './dto/public-user.dto.js';

@Injectable()
export class UsersService {
    constructor(private readonly db: DatabaseService) {}

    getPublicById(id: string): PublicUserDto {
        const user = this.db.collections.users.getById(id);
        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }

        const { password: _password, ...publicUser } = user;
        return publicUser as PublicUserDto;
    }
}
