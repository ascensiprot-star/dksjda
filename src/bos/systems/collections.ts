import { action, defineSystem } from '../core/system';
import { db, asArray, asRecord, intOrZero } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { stringField, optionalString, enumField, pagination, isoDateField } from '../core/validation';

const COLLECTION_STATUSES = ['draft', 'scheduled', 'live', 'completed', 'archived'] as const;
const COLLECTION_TYPES = ['season', 'drop', 'essentials'] as const;

interface CollectionRow {
  id: string;
  name?: unknown;
  slug?: string | null;
  type?: string | null;
  status?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  editionSize?: number | null;
  cover?: string | null;
  productIds?: unknown;
}

function localized(value: unknown): { fi: string; en: string } {
  if (typeof value === 'string') return { fi: value, en: value };
  const record = asRecord(value);
  return { fi: String(record.fi || record.en || ''), en: String(record.en || record.fi || '') };
}

export const collectionsSystem = defineSystem({
  id: 'collections',
  index: 5,
  name: 'Collections',
  screen: 'collections',
  description: 'Drops and seasonal collections with publication windows.',
  actions: {
    list: action('catalog.read', 'List collections.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 40);
      let query = db.from('collections').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<CollectionRow>(query.order('startAt', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(
          status
            ? db.from('collections').select('*', { count: 'exact', head: true }).eq('status', status)
            : db.from('collections').select('*', { count: 'exact', head: true })
        ),
      ]);
      return {
        collections: rows.map((row) => ({
          ...row,
          nameLocalized: localized(row.name),
          productCount: asArray(row.productIds).length,
        })),
        total,
        limit,
        offset,
      };
    }),

    get: action('catalog.read', 'Load a collection and its product membership.', async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const collection = await db.required<CollectionRow>(
        db.from('collections').select('*').eq('id', id).maybeSingle(),
        'Collection not found.'
      );
      const productIds = asArray(collection.productIds).map(String);
      const products = productIds.length
        ? await db.rows(db.from('products').select('id, name, price, stock, status').in('id', productIds))
        : [];
      return { collection, products };
    }),

    save: action('catalog.write', 'Create or update a collection.', async (ctx, input) => {
      const id = optionalString(input, 'id', 120) || bosId('col');
      const existing = await db.one<CollectionRow>(
        db.from('collections').select('*').eq('id', id).maybeSingle()
      );
      const name = input.name === undefined ? existing?.name : input.name;
      if (!localized(name).en) throw badRequest('A collection name is required.');
      const type =
        input.type === undefined
          ? (existing?.type as string) || 'drop'
          : enumField(input, 'type', COLLECTION_TYPES);
      const status =
        input.status === undefined
          ? (existing?.status as string) || 'draft'
          : enumField(input, 'status', COLLECTION_STATUSES);
      const startAt = isoDateField(input, 'startAt');
      const endAt = isoDateField(input, 'endAt');
      if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
        throw badRequest('Collection end must be after its start.');
      }
      const slug =
        optionalString(input, 'slug', 120) ||
        existing?.slug ||
        localized(name).en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const editionSize =
        input.editionSize === undefined ? intOrZero(existing?.editionSize) : intOrZero(input.editionSize);
      if (editionSize < 0) throw badRequest('Edition size cannot be negative.');

      const patch: Record<string, unknown> = {
        id,
        name: localized(name),
        slug,
        type,
        status,
        updatedAt: new Date().toISOString(),
      };
      if (input.startAt !== undefined) patch.startAt = startAt || null;
      if (input.endAt !== undefined) patch.endAt = endAt || null;
      if (input.editionSize !== undefined) patch.editionSize = editionSize;
      if (input.cover !== undefined) patch.cover = optionalString(input, 'cover', 500) || null;
      if (input.productIds !== undefined) patch.productIds = asArray(input.productIds).map(String).slice(0, 500);

      const saved = await db.write<CollectionRow>(
        db.from('collections').upsert(patch, { onConflict: 'id' }).select('*').single()
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'catalog.collection.update' : 'catalog.collection.create',
        targetType: 'collection',
        targetId: id,
        after: { status, type, slug },
        requestId: ctx.requestId,
      });
      return { collection: saved };
    }),

    publish: action('catalog.publish', 'Publish a collection and verify its products.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const collection = await db.required<CollectionRow>(
        db.from('collections').select('*').eq('id', id).maybeSingle(),
        'Collection not found.'
      );
      const productIds = asArray(collection.productIds).map(String);
      if (!productIds.length) throw badRequest('A collection needs at least one product.');
      const products = await db.rows<{ id: string; status: string | null }>(
        db.from('products').select('id, status').in('id', productIds)
      );
      const unpublished = products.filter((product) => product.status !== 'published');
      if (unpublished.length) {
        throw conflict('Every product in the collection must be published first.', {
          unpublished: unpublished.map((product) => product.id),
        });
      }
      const now = new Date().toISOString();
      await db.from('collections').update({ status: 'live', updatedAt: now }).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.collection.publish',
        targetType: 'collection',
        targetId: id,
        before: { status: collection.status },
        after: { status: 'live' },
        requestId: ctx.requestId,
      });
      return { id, status: 'live' };
    }),

    assignProducts: action('catalog.write', 'Set collection membership and keep products in sync.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const productIds = asArray(input.productIds).map(String).slice(0, 500);
      const collection = await db.required<CollectionRow>(
        db.from('collections').select('*').eq('id', id).maybeSingle(),
        'Collection not found.'
      );
      const previous = asArray(collection.productIds).map(String);
      const removed = previous.filter((productId) => !productIds.includes(productId));
      await db
        .from('collections')
        .update({ productIds, updatedAt: new Date().toISOString() })
        .eq('id', id);

      for (const productId of addedProductIds(previous, productIds)) {
        const product = await db.one<{ collectionIds?: unknown }>(
          db.from('products').select('collectionIds').eq('id', productId).maybeSingle()
        );
        if (!product) continue;
        const next = Array.from(new Set([...asArray(product.collectionIds).map(String), id]));
        await db.from('products').update({ collectionIds: next }).eq('id', productId);
      }
      for (const productId of removed) {
        const product = await db.one<{ collectionIds?: unknown }>(
          db.from('products').select('collectionIds').eq('id', productId).maybeSingle()
        );
        if (!product) continue;
        const next = asArray(product.collectionIds).map(String).filter((entry) => entry !== id);
        await db.from('products').update({ collectionIds: next }).eq('id', productId);
      }

      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.collection.assign_products',
        targetType: 'collection',
        targetId: id,
        before: { productIds: previous },
        after: { productIds },
        requestId: ctx.requestId,
      });
      return { id, productIds, added: addedProductIds(previous, productIds), removed };
    }),

    archive: action('catalog.publish', 'Archive a collection.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const collection = await db.required<CollectionRow>(
        db.from('collections').select('*').eq('id', id).maybeSingle(),
        'Collection not found.'
      );
      await db
        .from('collections')
        .update({ status: 'archived', updatedAt: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.collection.archive',
        targetType: 'collection',
        targetId: id,
        before: { status: collection.status },
        requestId: ctx.requestId,
      });
      return { id, status: 'archived' };
    }),
  },
});

function addedProductIds(previous: string[], next: string[]): string[] {
  return next.filter((id) => !previous.includes(id));
}
