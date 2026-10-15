'use strict';
/* Prisma client singleton. Import from here everywhere. */
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

module.exports = { db };
