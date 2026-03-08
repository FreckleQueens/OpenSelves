import { Injectable } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService extends PrismaClient {
	constructor() {
		const adapter = new PrismaMariaDb({});
		super({ adapter });
	}
}
