// Local dev: Vite with hot reload plus the /api functions, in one process.
import { createServer } from 'vite';
import { mountApi } from '../server.mjs';

const vite = await createServer({ server: { port: +process.env.PORT || 5173, host: '127.0.0.1' }, plugins: [{
  name: 'api', configureServer(s) { mountApi(s.middlewares); },
}] });
await vite.listen();
vite.printUrls();
