import { action, defineSystem } from '../core/system';
import { db, intOrZero, numeric } from '../core/repository';
import { supabase } from '../../supabase/config';
import { audit } from '../core/audit';
import { badRequest, conflict } from '../core/errors';
import { bosId } from '../core/ids';
import { stringField, optionalString, enumField, pagination } from '../core/validation';
import { asArray } from '../core/repository';

const TARGETS = ['desktop', 'mobile', 'both'] as const;
const KINDS = ['image', 'video'] as const;

interface MediaRow {
  id: string;
  path: string;
  url: string;
  kind: string;
  alt?: string | null;
  target?: string | null;
  "focalX"?: number | null;
  "focalY"?: number | null;
  framing?: unknown;
}

export const mediaSystem = defineSystem({
  id: 'media',
  index: 7,
  name: 'Media Library',
  screen: 'media',
  description: 'Asset registry, focal framing and safe removal.',
  actions: {
    list: action('catalog.read', 'List media assets.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const search = optionalString(input, 'search', 120);
      const kind = optionalString(input, 'kind', 20);
      const target = optionalString(input, 'target', 20);
      let query = db.from('media_assets').select('*', { count: 'exact' });
      if (search) query = query.ilike('path', `%${search}%`);
      if (kind) query = query.eq('kind', kind);
      if (target) query = query.eq('target', target);
      const [rows, total] = await Promise.all([
        db.rows<MediaRow>(query.order('createdAt', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('media_assets').select('*', { count: 'exact', head: true })),
      ]);
      return { media: rows, total, limit, offset };
    }),

    register: action('catalog.write', 'Register an uploaded asset after storage succeeds.', async (ctx, input) => {
      const path = stringField(input, 'path', { required: true, max: 500 });
      const url = stringField(input, 'url', { required: true, max: 1000 });
      if (!/^(https:\/\/|\/)/.test(url)) throw badRequest('Media URL must be https or site-relative.');
      const kind = enumField(input, 'kind', KINDS, { fallback: 'image' });
      const target = enumField(input, 'target', TARGETS, { fallback: 'both' });
      const existing = await db.one<MediaRow>(
        db.from('media_assets').select('id').eq('path', path).maybeSingle()
      );
      if (existing) throw conflict('An asset with this storage path is already registered.');
      const row = {
        id: bosId('med'),
        path,
        url,
        kind,
        target,
        alt: optionalString(input, 'alt', 300) || null,
        width: intOrZero(input.width) || null,
        height: intOrZero(input.height) || null,
        sizeBytes: intOrZero(input.sizeBytes) || null,
        mimeType: optionalString(input, 'mimeType', 120) || null,
        focalX: numeric(input.focalX, 50),
        focalY: numeric(input.focalY, 50),
        createdAt: new Date().toISOString(),
      };
      const saved = await db.write<MediaRow>(
        db.from('media_assets').insert(row).select('*').single()
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'media.asset.register',
        targetType: 'media',
        targetId: row.id,
        after: { path, kind, target },
        requestId: ctx.requestId,
      });
      return { asset: saved };
    }),

    update: action('catalog.write', 'Update alt text, focal point, framing or target.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 80 });
      const existing = await db.one<MediaRow>(
        db.from('media_assets').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw badRequest('Media asset not found.');
      const patch: Record<string, unknown> = {};
      if (input.alt !== undefined) patch.alt = optionalString(input, 'alt', 300) || null;
      if (input.target !== undefined) patch.target = enumField(input, 'target', TARGETS);
      if (input.focalX !== undefined) {
        const value = numeric(input.focalX, 50);
        if (value < 0 || value > 100) throw badRequest('focalX must be 0-100.');
        patch.focalX = value;
      }
      if (input.focalY !== undefined) {
        const value = numeric(input.focalY, 50);
        if (value < 0 || value > 100) throw badRequest('focalY must be 0-100.');
        patch.focalY = value;
      }
      if (input.framing !== undefined) patch.framing = input.framing;
      if (!Object.keys(patch).length) throw badRequest('Nothing to update.');
      await db.from('media_assets').update(patch).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'media.asset.update',
        targetType: 'media',
        targetId: id,
        before: { alt: existing.alt, focalX: existing.focalX, focalY: existing.focalY },
        after: patch,
        requestId: ctx.requestId,
      });
      return { id, updated: patch };
    }),

    usage: action('catalog.read', 'Find products referencing an asset URL.', async (_ctx, input) => {
      const url = stringField(input, 'url', { required: true, max: 1000 });
      const products = await db.rows<{ id: string; name?: unknown }>(
        db.from('products').select('id, name').contains('images', [url]).limit(200)
      );
      return { url, products, used: products.length > 0 };
    }),

    remove: action('catalog.publish', 'Remove an unreferenced asset from storage and the registry.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 80 });
      const asset = await db.one<MediaRow>(
        db.from('media_assets').select('*').eq('id', id).maybeSingle()
      );
      if (!asset) throw badRequest('Media asset not found.');
      const used = await db.rows<{ id: string }>(
        db.from('products').select('id').contains('images', [asset.url]).limit(1)
      );
      if (used.length) throw conflict('This asset is still used by a product. Detach it first.');
      const removed = await supabase.storage.from('media').remove([asset.path]);
      if (removed.error && !/not found/i.test(removed.error.message)) {
        throw badRequest('Storage removal failed. The registry entry was kept.');
      }
      await db.from('media_assets').delete().eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'media.asset.remove',
        targetType: 'media',
        targetId: id,
        before: { path: asset.path, url: asset.url },
        requestId: ctx.requestId,
      });
      return { id, removed: true };
    }),

    stats: action('catalog.read', 'Asset counts by kind and target.', async () => {
      const rows = await db.rows<{ kind: string; target: string }>(
        db.from('media_assets').select('kind, target').limit(20000)
      );
      const byKind = new Map<string, number>();
      const byTarget = new Map<string, number>();
      for (const row of rows) {
        byKind.set(row.kind, (byKind.get(row.kind) || 0) + 1);
        byTarget.set(row.target, (byTarget.get(row.target) || 0) + 1);
      }
      return {
        total: rows.length,
        byKind: Array.from(byKind.entries()).map(([kind, count]) => ({ kind, count })),
        byTarget: Array.from(byTarget.entries()).map(([target, count]) => ({ target, count })),
      };
    }),
  },
});
