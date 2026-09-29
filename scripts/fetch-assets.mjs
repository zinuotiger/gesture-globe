import {
  open,
  mkdir,
  readFile,
  writeFile,
  unlink,
  link,
  rename,
  lstat,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import {
  readManifest,
  readAsset,
  safePath,
  MANIFEST_PATH,
  MODEL_URL,
} from './asset-policy.mjs';

export async function fetchAssets(
  root,
  { request = globalThis.fetch, log = console.log } = {},
) {
  const manifest = await readManifest(root);
  for (const entry of manifest.entries.filter(
    (e) => e.type === 'EXTERNAL_LOCAL',
  )) {
    if (entry.sourceUrl !== MODEL_URL)
      throw new Error(`No downloader authorized for ${entry.id}`);
    const destination = safePath(root, entry.localPath);
    await mkdir(path.dirname(destination), { recursive: true });
    if (
      !(await realpath(path.dirname(destination))).startsWith(
        (await realpath(root)) + path.sep,
      )
    )
      throw new Error('Destination escapes repository');
    const receiptPath = destination + '.receipt.json';
    try {
      await lstat(destination);
      const receipt = JSON.parse(
        await readFile(receiptPath, 'utf8').catch(() => {
          throw new Error(
            `UNKNOWN_PROVENANCE: ${entry.localPath}; refusing overwrite`,
          );
        }),
      );
      if (
        receipt.sourceUrl !== entry.sourceUrl ||
        receipt.upstreamVersion !== entry.upstreamVersion ||
        receipt.sha256 !== entry.sha256 ||
        !Number.isFinite(Date.parse(receipt.fetchedAt))
      )
        throw new Error(
          `UNKNOWN_PROVENANCE: ${entry.localPath}; refusing overwrite`,
        );
      await readAsset(root, entry);
      log(`ALREADY_VERIFIED ${entry.id}: ${entry.sha256}`);
      continue;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const temp = destination + '.' + randomUUID() + '.part';
    const attempt = {
      id: entry.id,
      sourceUrl: entry.sourceUrl,
      upstreamVersion: entry.upstreamVersion,
      requestedAt: new Date().toISOString(),
      status: 'STARTED',
    };
    await writeFile(
      destination + '.attempt.json',
      JSON.stringify(attempt, null, 2) + '\n',
    );
    log(`FETCH_START ${JSON.stringify(attempt)}`);
    let handle;
    try {
      const response = await request(entry.sourceUrl, {
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(120000),
      });
      if (!response.ok || !response.body)
        throw new Error(`Download failed: HTTP ${response.status}`);
      handle = await open(temp, 'wx');
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > entry.sizeBytes)
          throw new Error(`${entry.id}: download exceeds pinned size`);
        await handle.writeFile(chunk);
      }
      await handle.sync();
      await handle.close();
      handle = undefined;
      await readAsset(root, {
        ...entry,
        localPath: path.relative(root, temp).split(path.sep).join('/'),
      });
      const receipt = {
        ...attempt,
        status: 'VERIFIED',
        sha256: entry.sha256,
        sizeBytes: total,
        fetchedAt: new Date().toISOString(),
      };
      const receiptTemp = temp + '.receipt.json';
      await writeFile(receiptTemp, JSON.stringify(receipt, null, 2) + '\n', {
        flag: 'wx',
      });
      try {
        // Hard-link promotion atomically creates a complete final file, refusing EEXIST.
        // Unlike overwrite-style rename, an unrelated concurrently created file is preserved.
        await link(temp, destination);
        await rename(receiptTemp, receiptPath);
      } finally {
        await unlink(receiptTemp).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
      }
      if (entry.fetchedAt === null) {
        entry.fetchedAt = receipt.fetchedAt;
        await writeFile(
          safePath(root, MANIFEST_PATH),
          JSON.stringify(manifest, null, 2) + '\n',
        );
      }
      await writeFile(
        destination + '.attempt.json',
        JSON.stringify(receipt, null, 2) + '\n',
      );
      log(
        `FETCH_VERIFIED ${entry.id}: ${entry.sha256}; license=${entry.licenseStatus}; redistribution=false`,
      );
    } catch (error) {
      await writeFile(
        destination + '.attempt.json',
        JSON.stringify(
          { ...attempt, status: 'FAILED', error: error.message },
          null,
          2,
        ) + '\n',
      );
      throw error;
    } finally {
      if (handle) await handle.close();
      await unlink(temp).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    await fetchAssets(process.cwd());
  } catch (error) {
    console.error(`ASSETS FETCH FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
