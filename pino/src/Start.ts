// test.ts
import { VanillaPino } from './VanillaPino.js';

const logger = new VanillaPino({
  filePath: './test.log',
  prettyPrint: true
});

// Test básico
logger.info('Inicio de prueba');
logger.debug('Debug info', { userId: 123 });
logger.warn('Advertencia', { reason: 'test' });
logger.error('Error', new Error('Test error'));

// Test de batch (100 logs rápidos)
console.time('100 logs');
for (let i = 0; i < 100; i++) {
  logger.info(`Log ${i}`, { index: i });
}
console.timeEnd('100 logs'); // Debería ser <10ms

// Test memory history
setTimeout(() => {
  const history = logger.getMemoryHistory();
  console.log(`Logs en memoria: ${history.length}`);
  
  // Cleanup
  logger.destroy();
}, 2000);