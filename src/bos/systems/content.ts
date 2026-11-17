import { action, defineSystem } from '../core/system';
import { db, asRecord, asArray } from '../core/repository';
import { audit } from '../core/audit';
import { conflict, badRequest } from '../core/errors';
import { optionalString, stringField } from '../core/validation';

interface ContentRow {
  id: string;
  sectionOrder?: unknown;
  heroMedia?: unknown;
  heroSlides?: unknown;
  announcementBar?: unknown;
  journalPosts?: unknown;
  translations?: unknown;
  updatedAt?: string | null;
}

function validateTranslationRecord(value: unknown, field: string): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${field} must be an object keyed by locale.`);
  }
}

export const contentSystem = defineSystem({
  id: 'content',
  index: 14,
  name: 'Editorial Content',
  screen: 'content',
  description: 'Hero, announcement, journal and translation documents.',
  actions: {
    get: action('catalog.read', 'Load the storefront content document.', async () => {
      const content = await db.one<ContentRow>(
        db.from('content').select('*').eq('id', 'store').maybeSingle()
      );
      return { content: content || null };
    }),

    save: action('catalog.write', 'Save content with optimistic concurrency.', async (ctx, input) => {
      const existing = await db.one<ContentRow>(
        db.from('content').select('*').eq('id', 'store').maybeSingle()
      );
      const expected = optionalString(input, 'expectedUpdatedAt', 60);
      if (expected && existing?.updatedAt && expected !== existing.updatedAt) {
        throw conflict('Content changed since you loaded it. Reload and try again.', {
          currentUpdatedAt: existing.updatedAt,
        });
      }
      const patch: Record<string, unknown> = {
        id: 'store',
        updatedAt: new Date().toISOString(),
      };
      if (input.sectionOrder !== undefined) {
        if (!Array.isArray(input.sectionOrder)) throw badRequest('sectionOrder must be an array.');
        patch.sectionOrder = input.sectionOrder.map(String).slice(0, 50);
      }
      if (input.heroMedia !== undefined) {
        const media = asRecord(input.heroMedia);
        patch.heroMedia = media;
      }
      if (input.heroSlides !== undefined) {
        patch.heroSlides = asArray(input.heroSlides).slice(0, 20);
      }
      if (input.announcementBar !== undefined) {
        const bar = asRecord(input.announcementBar);
        if (bar.fi !== undefined || bar.en !== undefined) {
          patch.announcementBar = {
            fi: String(bar.fi || ''),
            en: String(bar.en || ''),
            sv: String(bar.sv || ''),
          };
        } else {
          patch.announcementBar = bar;
        }
      }
      if (input.journalPosts !== undefined) {
        patch.journalPosts = asArray(input.journalPosts).slice(0, 200);
      }
      if (input.translations !== undefined) {
        validateTranslationRecord(input.translations, 'translations');
        patch.translations = input.translations;
      }
      if (Object.keys(patch).length <= 2) throw badRequest('Nothing to update.');

      await db.from('content').upsert(patch, { onConflict: 'id' });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'content.update',
        targetType: 'content',
        targetId: 'store',
        before: existing ? { updatedAt: existing.updatedAt } : undefined,
        after: { updatedAt: patch.updatedAt, fields: Object.keys(patch).filter((key) => key !== 'id') },
        requestId: ctx.requestId,
      });
      return { updated: Object.keys(patch).filter((key) => key !== 'id'), updatedAt: patch.updatedAt };
    }),

    journal: action('catalog.read', 'Journal posts with completeness checks.', async () => {
      const content = await db.one<ContentRow>(
        db.from('content').select('journalPosts').eq('id', 'store').maybeSingle()
      );
      const posts = asArray(content?.journalPosts).map((raw) => {
        const post = asRecord(raw);
        const title = asRecord(post.title);
        const body = asRecord(post.body);
        const missing: string[] = [];
        if (!String(title.en || title.fi || '')) missing.push('title');
        if (!String(post.slug || '')) missing.push('slug');
        if (!asArray(body.en).length && !asArray(body.fi).length) missing.push('body');
        if (!String(post.image || '')) missing.push('image');
        return { ...post, complete: missing.length === 0, missing };
      });
      return {
        posts,
        total: posts.length,
        incomplete: posts.filter((post) => !post.complete).length,
      };
    }),

    journalUpsert: action('catalog.write', 'Create or replace a journal post document.', async (ctx, input) => {
      const post = asRecord(input.post);
      if (!post.id) throw badRequest('post.id is required.');
      if (!post.slug) throw badRequest('post.slug is required.');
      const content = await db.one<ContentRow>(
        db.from('content').select('*').eq('id', 'store').maybeSingle()
      );
      const posts = asArray(content?.journalPosts).map(asRecord);
      const index = posts.findIndex((entry) => String(entry.id) === String(post.id));
      if (index >= 0) posts[index] = post;
      else posts.unshift(post);
      await db.from('content').upsert(
        {
          id: 'store',
          journalPosts: posts,
          updatedAt: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'content.journal.upsert',
        targetType: 'content',
        targetId: String(post.id),
        after: { slug: post.slug, title: post.title },
        requestId: ctx.requestId,
      });
      return { id: post.id, slug: post.slug, created: index < 0 };
    }),

    journalDelete: action('catalog.write', 'Remove a journal post.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const content = await db.one<ContentRow>(
        db.from('content').select('*').eq('id', 'store').maybeSingle()
      );
      const posts = asArray(content?.journalPosts).map(asRecord);
      const next = posts.filter((entry) => String(entry.id) !== id);
      if (next.length === posts.length) throw badRequest('Journal post not found.');
      await db.from('content').upsert(
        { id: 'store', journalPosts: next, updatedAt: new Date().toISOString() },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'content.journal.delete',
        targetType: 'content',
        targetId: id,
        requestId: ctx.requestId,
      });
      return { id, deleted: true, remaining: next.length };
    }),

    announcement: action('catalog.write', 'Update the announcement bar.', async (ctx, input) => {
      const fi = stringField(input, 'fi', { max: 200 });
      const en = stringField(input, 'en', { max: 200 });
      const sv = optionalString(input, 'sv', 200) || '';
      const content = await db.one<ContentRow>(
        db.from('content').select('*').eq('id', 'store').maybeSingle()
      );
      if (!content) throw badRequest('Content document does not exist.');
      await db.from('content').update({
        announcementBar: { fi, en, sv },
        updatedAt: new Date().toISOString(),
      }).eq('id', 'store');
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'content.announcement.update',
        targetType: 'content',
        targetId: 'store',
        before: content.announcementBar,
        after: { fi, en, sv },
        requestId: ctx.requestId,
      });
      return { fi, en, sv };
    }),

    translations: action('catalog.read', 'Read the translation dictionary.', async () => {
      const content = await db.one<ContentRow>(
        db.from('content').select('translations').eq('id', 'store').maybeSingle()
      );
      return { translations: content?.translations || {} };
    }),
  },
});
