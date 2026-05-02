import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execFileAsync = promisify(execFile);

async function main() {
  const printer = process.env.PRINTER_NAME || 'POS-80';
  const binary = join(__dirname, '..', 'resources', 'bin', 'receipt.exe');

  const args = [
    printer,
    'Chayxana',
    'Buyurtma #TEST\nStol: Stol 1\nTur: Zalda\nSana: 02.05.2026 13:00',
    'Salat|1|20000|20000;Choy|2|5000|10000',
    '30000',
    '0',
    '30000',
  ];

  console.log('Calling:', binary);
  console.log('Args:', args);

  const result = await execFileAsync(binary, args, {
    timeout: 15000,
    windowsHide: true,
  });

  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('SUCCESS: paper should have printed');
}

main().catch((error: unknown) => {
  console.error('FAILED:', error);
  process.exit(1);
});
