import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

// Reuse the client across HMR reloads in development so we don't exhaust the
// connection pool. In production a single module instance is enough.
if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

export default prisma;
