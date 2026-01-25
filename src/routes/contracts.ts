import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { getVaultBalance, getKpiStatus, getProjectInfo } from '../lib/contracts/vault';

const contractsRoute = new Hono();

contractsRoute.use('*', authMiddleware);

// Get vault balance for a project
contractsRoute.get('/vault/:address/balance', async (c) => {
  const address = c.req.param('address');
  const balance = await getVaultBalance(address);
  return c.json({ balance });
});

// Get KPI status from vault
contractsRoute.get('/vault/:address/kpi/:index', async (c) => {
  const address = c.req.param('address');
  const index = parseInt(c.req.param('index'));
  const status = await getKpiStatus(address, index);
  return c.json({ status });
});

// Get project info from vault
contractsRoute.get('/vault/:address/info', async (c) => {
  const address = c.req.param('address');
  const info = await getProjectInfo(address);
  return c.json({ info });
});

// Generate calldata for frontend to call (for deposits, etc.)
contractsRoute.post('/calldata/deposit', zValidator('json', z.object({
  vaultAddress: z.string().startsWith('0x'),
  amount: z.string(),
})), async (c) => {
  const { vaultAddress, amount } = c.req.valid('json');

  // Return calldata for frontend
  // SC dev will provide actual function signature
  return c.json({
    to: vaultAddress,
    data: '0x...', // Placeholder - SC dev to provide actual function signature
    value: amount,
  });
});

export { contractsRoute as contractsRouter };
