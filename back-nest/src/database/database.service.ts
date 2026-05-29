import { Injectable, type OnModuleInit } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { AppConfigService } from '../config/app-config.service.js';
import { createCollections, type Collections } from './collections.js';

@Injectable()
export class DatabaseService implements OnModuleInit {
    collections!: Collections;

    constructor(private readonly config: AppConfigService) {}

    async onModuleInit(): Promise<void> {
        const dir = this.config.dataDir;
        await mkdir(dir, { recursive: true });
        this.collections = await createCollections(dir);
    }
}
