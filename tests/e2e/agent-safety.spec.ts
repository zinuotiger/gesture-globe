import { createServer } from 'node:http';
import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
let server: ReturnType<typeof createServer>,
  origin: string,
  aborted = 0;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
  server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.startsWith('/slow')) {
      res.on('close', () => {
        aborted++;
      });
      return;
    }
    const bad =
      new URL(req.url!, 'http://127.0.0.1').searchParams.get('q') === 'bad';
    res.end(
      JSON.stringify({
        candidates: bad
          ? [
              {
                id: 'x',
                label: '<script>window.pwned=1</script>',
                lat: 1,
                lon: 2,
              },
            ]
          : [
              { id: 'a', label: 'Springfield', lat: 39.9, lon: 116.4 },
              { id: 'b', label: 'Springfield', lat: 40, lon: -90 },
            ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fixture.close();
});
test('actual loopback candidate confirmation rejects HTML and cancel aborts waiting network without a lock', async ({
  page,
}) => {
  await page.goto(
    fixture.origin +
      '/tests/fixtures/agent.html?geocode=' +
      encodeURIComponent(origin + '/geo') +
      '&weather=' +
      encodeURIComponent(origin + '/slow'),
  );
  await page.getByLabel('地点名称').fill('bad');
  await page.getByRole('button', { name: '查找地点', exact: true }).click();
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'FAILED',
  );
  await expect(page.locator('.agent-results')).toContainText(
    '服务返回的数据无效',
  );
  await expect(page.locator('.agent-choices button')).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, 'pwned')),
  ).toBeUndefined();
  await page.getByLabel('地点名称').fill('Springfield');
  await page.getByRole('button', { name: '查找地点', exact: true }).click();
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'AWAITING_CONFIRMATION',
  );
  await expect(page.locator('.agent-choices button')).toHaveCount(2);
  await page
    .getByRole('button', {
      name: '选择 Springfield (39.9, 116.4)',
      exact: true,
    })
    .click();
  await expect(page.locator('.location-card')).toContainText('39.9000');
  await page.getByLabel('起点纬度').fill('10');
  await page.getByLabel('起点经度').fill('20');
  const before = aborted;
  await page.getByRole('button', { name: '查询天气', exact: true }).click();
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'RUNNING',
  );
  await page.getByRole('button', { name: '取消操作', exact: true }).click();
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'CANCELLED',
  );
  await expect.poll(() => aborted).toBeGreaterThan(before);
  await expect(page.locator('.control-source')).toContainText('待命');
  await page.evaluate(() => window.agentFixture.dispose());
});
