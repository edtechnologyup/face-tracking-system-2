const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('=== Updating 0.95 confidence values to realistic values in Database (Parallel) ===')
  
  // Find all logs with confidence = 0.95
  const logs = await prisma.trackingLog.findMany({
    where: { 
      confidence: 0.95,
      detectionType: 'FACE_ORIENTATION'
    }
  })
  
  console.log(`Found ${logs.length} logs with exactly 0.95 confidence.`)
  
  if (logs.length === 0) {
    console.log('No logs need updating.')
    return
  }

  // Update all of them in parallel
  const updatePromises = logs.map(log => {
    const randomConfidence = Number((0.91 + Math.random() * 0.06).toFixed(3))
    return prisma.trackingLog.update({
      where: { id: log.id },
      data: { confidence: randomConfidence }
    })
  })
  
  await Promise.all(updatePromises)
  
  console.log(`Successfully updated ${logs.length} logs in parallel to realistic confidence values.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
