const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const logsCount = await prisma.trackingLog.count()
  const logsWith95 = await prisma.trackingLog.count({
    where: { confidence: 0.95 }
  })
  const logsWithOther = await prisma.trackingLog.count({
    where: { 
      NOT: { confidence: 0.95 }
    }
  })
  
  console.log('Total logs:', logsCount)
  console.log('Logs with exactly 0.95 confidence:', logsWith95)
  console.log('Logs with other confidence values:', logsWithOther)
  
  const sample = await prisma.trackingLog.findMany({
    take: 5,
    orderBy: { timestamp: 'desc' }
  })
  console.log('Latest 5 logs:', JSON.stringify(sample, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
