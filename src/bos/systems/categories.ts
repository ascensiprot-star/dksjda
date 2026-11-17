import { action, defineSystem } from '../core/system';
import { db, asRecord, intOrZero } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict } from '../core/errors';
import { stringField, optionalString, boolField } from '../core/validation';

interface CategoryRow {
  id: string;
  parentId?: string | null;
  name?: unknown;
  slug?: string | null;
  order?: number | null;
  visible?: boolean | null;
  image?: string | null;
  isComingSoon?: boolean | null;
}

function localized(value: unknown): { fi: string; en: string } {
  if (typeof value === 'string') return { fi: value, en: value };
  const record = asRecord(value);
  return { fi: String(record.fi || record.en || ''), en: String(record.en || record.fi || '') };
}

export const categoriesSystem = defineSystem({
  id: 'categories',
  index: 6,
  name: 'Categories',
  screen: 'categories',
  description: 'Navigation taxonomy, hierarchy and visibility.',
  actions: {
    tree: action('catalog.read', 'Full category tree with product counts.', async () => {
      const [categories, products] = await Promise.all([
        db.rows<CategoryRow>(db.from('categories').select('*').order('order', { ascending: true })),
        db.rows<{ categoryIds?: unknown; category?: string | null }>(
          db.from('products').select('categoryIds, category').limit(10000)
        ),
      ]);
      const counts = new Map<string, number>();
      for (const product of products) {
        const ids = Array.isArray(product.categoryIds)
          ? product.categoryIds.map(String)
          : product.category
            ? [String(product.category)]
            : [];
        for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
      }
      const byParent = new Map<string, CategoryRow[]>();
      for (const category of categories) {
        const parent = category.parentId || 'root';
        const list = byParent.get(parent) || [];
        list.push(category);
        byParent.set(parent, list);
      }
      const build = (parentId: string): unknown[] =>
        (byParent.get(parentId) || []).map((category) => ({
          ...category,
          nameLocalized: localized(category.name),
          productCount: counts.get(category.id) || 0,
          children: build(category.id),
        }));
      return { categories: build('root'), total: categories.length };
    }),

    save: action('catalog.write', 'Create or update a category.', async (ctx, input) => {
      const id = optionalString(input, 'id', 120) || bosId('cat');
      const existing = await db.one<CategoryRow>(
        db.from('categories').select('*').eq('id', id).maybeSingle()
      );
      const name = input.name === undefined ? existing?.name : input.name;
      if (!localized(name).en) throw badRequest('A category name is required.');
      const slug =
        optionalString(input, 'slug', 120) ||
        existing?.slug ||
        localized(name).en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const parentId = input.parentId === undefined ? existing?.parentId || null : optionalString(input, 'parentId', 120) || null;
      if (parentId === id) throw badRequest('A category cannot be its own parent.');
      if (parentId) {
        const parent = await db.one<CategoryRow>(
          db.from('categories').select('id').eq('id', parentId).maybeSingle()
        );
        if (!parent) throw badRequest('Parent category does not exist.');
      }
      const patch: Record<string, unknown> = {
        id,
        name: localized(name),
        slug,
        parentId,
        order: input.order === undefined ? intOrZero(existing?.order) : intOrZero(input.order),
        visible: input.visible === undefined ? existing?.visible !== false : boolField(input, 'visible', true),
        updatedAt: new Date().toISOString(),
      };
      if (input.image !== undefined) patch.image = optionalString(input, 'image', 500) || null;
      if (input.isComingSoon !== undefined) patch.isComingSoon = boolField(input, 'isComingSoon', false);
      await db.from('categories').upsert(patch, { onConflict: 'id' });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'catalog.category.update' : 'catalog.category.create',
        targetType: 'category',
        targetId: id,
        after: { slug, parentId },
        requestId: ctx.requestId,
      });
      return { id, slug, parentId };
    }),

    visibility: action('catalog.publish', 'Show or hide a category.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const visible = boolField(input, 'visible', true);
      const existing = await db.one<CategoryRow>(
        db.from('categories').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw badRequest('Category not found.');
      await db.from('categories').update({ visible }).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.category.visibility',
        targetType: 'category',
        targetId: id,
        before: { visible: existing.visible },
        after: { visible },
        requestId: ctx.requestId,
      });
      return { id, visible };
    }),

    reorder: action('catalog.write', 'Reorder sibling categories atomically.', async (ctx, input) => {
      const ids = Array.isArray(input.ids) ? input.ids.map(String).slice(0, 200) : [];
      if (!ids.length) throw badRequest('ids is required.');
      for (const [index, id] of ids.entries()) {
        await db.from('categories').update({ order: index }).eq('id', id);
      }
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.category.reorder',
        targetType: 'category',
        targetId: 'collection',
        after: { ids },
        requestId: ctx.requestId,
      });
      return { reordered: ids.length };
    }),

    remove: action('catalog.publish', 'Delete an empty category.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const children = await db.rows<{ id: string }>(
        db.from('categories').select('id').eq('parentId', id).limit(1)
      );
      if (children.length) throw conflict('Move or delete child categories first.');
      const products = await db.rows<{ id: string }>(
        db.from('products').select('id').eq('category', id).limit(1)
      );
      if (products.length) throw conflict('Reassign products before deleting this category.');
      const existing = await db.one<CategoryRow>(
        db.from('categories').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw badRequest('Category not found.');
      await db.from('categories').delete().eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'catalog.category.delete',
        targetType: 'category',
        targetId: id,
        before: existing,
        requestId: ctx.requestId,
      });
      return { id, deleted: true };
    }),
  },
});
