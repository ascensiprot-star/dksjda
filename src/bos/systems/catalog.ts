import { action, defineSystem } from '../core/system';
import { db, intOrZero, numeric, asArray, asRecord } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { conflict, notFound, badRequest } from '../core/errors';
import { stringField, optionalString, enumField, pagination, boolField } from '../core/validation';

const PRODUCT_STATUSES = ['draft', 'published', 'scheduled', 'archived', 'coming_soon'] as const;

interface ProductRow {
  id: string;
  nr?: string | null;
  name?: unknown;
  price?: number | null;
  stock?: number | null;
  status?: string | null;
  images?: unknown;
  categoryIds?: unknown;
  collectionIds?: unknown;
  updatedAt?: string | null;
  createdAt?: string | null;
}

function localized(value: unknown): { fi: string; en: string } {
  if (typeof value === 'string') return { fi: value, en: value };
  const record = asRecord(value);
  return { fi: String(record.fi || record.en || ''), en: String(record.en || record.fi || '') };
}

function normalizedStatus(value: unknown): string {
  const status = String(value || 'draft');
  return PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number]) ? status : 'draft';
}

export const catalogSystem = defineSystem({
  id: 'catalog',
  index: 4,
  name: 'Catalogue',
  screen: 'products',
  description: 'Product lifecycle, pricing, media readiness and publishing rules.',
  actions: {
    list: action('catalog.read', 'Search and filter products.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const search = optionalString(input, 'search', 120);
      const status = optionalString(input, 'status', 40);
      let query = db.from('products').select('*', { count: 'exact' });
      if (search) query = query.ilike('id', `%${search}%`);
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<ProductRow>(query.order('updatedAt', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(
          status
            ? db.from('products').select('*', { count: 'exact', head: true }).eq('status', status)
            : db.from('products').select('*', { count: 'exact', head: true })
        ),
      ]);
      return {
        products: rows.map((product) => ({
          ...product,
          nameLocalized: localized(product.name),
          stock: intOrZero(product.stock),
          price: numeric(product.price, 0),
        })),
        total,
        limit,
        offset,
      };
    }),

    get: action('catalog.read', 'Load one product.', async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const product = await db.required<ProductRow>(
        db.from('products').select('*').eq('id', id).maybeSingle(),
        'Product not found.'
      );
      return { product };
    }),

    save: action('catalog.write', 'Create or update a product with optimistic concurrency.', async (ctx, input) => {
      const id = optionalString(input, 'id', 120) || bosId('prd');
      const existing = await db.one<ProductRow>(
        db.from('products').select('*').eq('id', id).maybeSingle()
      );
      const expectedUpdatedAt = optionalString(input, 'expectedUpdatedAt', 60);
      if (existing && expectedUpdatedAt && existing.updatedAt && expectedUpdatedAt !== existing.updatedAt) {
        throw conflict('This product changed since you loaded it. Reload and try again.', {
          currentUpdatedAt: existing.updatedAt,
        });
      }

      const nameInput = input.name;
      const name =
        nameInput === undefined && existing
          ? existing.name
          : localized(nameInput === undefined ? existing?.name : nameInput);
      const nameEn = localized(name).en;
      if (!nameEn) throw badRequest('A product name is required.');

      const price =
        input.price === undefined ? numeric(existing?.price, 0) : numeric(input.price, -1);
      if (price < 0) throw badRequest('Price cannot be negative.');
      const stock = input.stock === undefined ? intOrZero(existing?.stock) : intOrZero(input.stock);
      if (stock < 0) throw badRequest('Stock cannot be negative.');
      const status =
        input.status === undefined ? normalizedStatus(existing?.status) : enumField(input, 'status', PRODUCT_STATUSES);

      const patch: Record<string, unknown> = {
        id,
        name,
        price,
        stock,
        status,
        updatedAt: new Date().toISOString(),
      };
      if (!existing) patch.createdAt = patch.updatedAt;
      if (input.nr !== undefined) patch.nr = optionalString(input, 'nr', 40) || null;
      if (input.description !== undefined) patch.description = input.description;
      if (input.material !== undefined) patch.material = input.material;
      if (input.images !== undefined) {
        patch.images = asArray(input.images).filter((value) => typeof value === 'string').slice(0, 30);
      }
      if (input.categoryIds !== undefined) {
        patch.categoryIds = asArray(input.categoryIds).map(String).slice(0, 20);
      }
      if (input.collectionIds !== undefined) {
        patch.collectionIds = asArray(input.collectionIds).map(String).slice(0, 20);
      }
      if (input.variants !== undefined) patch.variants = input.variants;
      if (input.seo !== undefined) patch.seo = input.seo;

      const saved = await db.write<ProductRow>(
        db.from('products').upsert(patch, { onConflict: 'id' }).select('*').single()
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'catalog.product.update' : 'catalog.product.create',
        targetType: 'product',
        targetId: id,
        before: existing ? { price: existing.price, stock: existing.stock, status: existing.status } : undefined,
        after: { price, stock, status },
        requestId: ctx.requestId,
      });
      return { product: saved };
    }),

    publish: action('catalog.publish', 'Publish a product after server-side checks.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const product = await db.required<ProductRow>(
        db.from('products').select('*').eq('id', id).maybeSingle(),
        'Product not found.'
      );
      const missing: string[] = [];
      if (!localized(product.name).en) missing.push('name');
      if (numeric(product.price, 0) <= 0) missing.push('price');
      if (asArray(product.images).length === 0) missing.push('image');
      if (missing.length) {
        throw badRequest(`Cannot publish: missing ${missing.join(', ')}.`, { missing });
      }
      const now = new Date().toISOString();
      await db.from('products').update({ status: 'published', publishAt: now, updatedAt: now }).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.product.publish',
        targetType: 'product',
        targetId: id,
        before: { status: product.status },
        after: { status: 'published' },
        requestId: ctx.requestId,
      });
      return { id, status: 'published', publishAt: now };
    }),

    archive: action('catalog.publish', 'Archive a product without deleting history.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const product = await db.required<ProductRow>(
        db.from('products').select('*').eq('id', id).maybeSingle(),
        'Product not found.'
      );
      await db
        .from('products')
        .update({ status: 'archived', updatedAt: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.product.archive',
        targetType: 'product',
        targetId: id,
        before: { status: product.status },
        requestId: ctx.requestId,
      });
      return { id, status: 'archived' };
    }),

    bulkStatus: action('catalog.publish', 'Change status for up to 100 products.', async (ctx, input) => {
      const ids = asArray(input.ids).map(String).slice(0, 100);
      if (!ids.length) throw badRequest('ids is required.');
      const status = enumField(input, 'status', PRODUCT_STATUSES);
      const { error } = await db.from('products').update({
        status,
        updatedAt: new Date().toISOString(),
      }).in('id', ids);
      if (error) throw badRequest('Bulk update failed.');
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.product.bulk_status',
        targetType: 'product',
        targetId: ids.join(',').slice(0, 200),
        after: { status, count: ids.length },
        requestId: ctx.requestId,
      });
      return { updated: ids.length, status };
    }),

    categories: action('catalog.write', 'Replace a product category assignment.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const categoryIds = asArray(input.categoryIds).map(String).slice(0, 20);
      await db
        .from('products')
        .update({ categoryIds, updatedAt: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.product.categories',
        targetType: 'product',
        targetId: id,
        after: { categoryIds },
        requestId: ctx.requestId,
      });
      return { id, categoryIds };
    }),

    collections: action('catalog.write', 'Replace a product collection assignment.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const collectionIds = asArray(input.collectionIds).map(String).slice(0, 20);
      await db
        .from('products')
        .update({ collectionIds, updatedAt: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.product.collections',
        targetType: 'product',
        targetId: id,
        after: { collectionIds },
        requestId: ctx.requestId,
      });
      return { id, collectionIds };
    }),
  },
});
