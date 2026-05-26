import { Injectable, NotFoundException } from '@nestjs/common';
import type { Stored, User } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class UsersService {
    constructor(private readonly db: DatabaseService) {}

    getPublicById(id: string): Stored<User> {
        const user = this.db.collections.users.getById(id);
        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }

        const { password: _password, ...publicUser } = user;
        return publicUser as Stored<User>;
    }
}
