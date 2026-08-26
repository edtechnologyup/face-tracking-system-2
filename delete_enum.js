const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(`DELETE FROM "tracking_logs" WHERE "detectionType" = 'BENCHMARK_METRICS'`);
  console.log('Deleted rows:', result);
}

main().catch(e => {
  console.error(e);
}).finally(async () => {
  await prisma.$disconnect();
});
