import type { BosAction } from '../core/system';
import { db, intOrZero, numeric, asArray } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { stringField, optionalString, intField, enumField, pagination, emailField } from '../core/validation';

const REVIEW_STATUSES = ['pending', 'published', 'rejected'] as const;

interface ReviewRow {
  id: string;
  product_id: string;
  customer_email: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  status: string;
  verified_purchase?: boolean | null;
  response?: string | null;
  created_at?: string;
}

export const reviewActions: Record<string, BosAction> = {
  reviews: {
    permission: 'review.read',
    description: 'List customer reviews.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 30);
      let query = db.from('reviews').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<ReviewRow>(query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('reviews').select('*', { count: 'exact', head: true })),
      ]);
      return { reviews: rows, total, limit, offset };
    },
  },

  reviewCreate: {
    permission: 'review.moderate',
    description: 'Record a review received through another channel.',
    handler: async (ctx, input) => {
      const productId = stringField(input, 'productId', { required: true, max: 120 });
      const email = emailField(input);
      const rating = intField(input, 'rating', { required: true, min: 1, max: 5 });
      const title = optionalString(input, 'title', 200) || '';
      const body = optionalString(input, 'body', 6000) || '';
      const product = await db.one(db.from('products').select('id').eq('id', productId).maybeSingle());
      if (!product) throw badRequest('Product not found.');
      const orders = await db.rows<{ id: string }>(
        db.from('orders').select('id').eq('customer->>email', email).limit(1)
      );
      const verified = orders.length > 0;
      const existing = await db.one<ReviewRow>(
        db.from('reviews').select('*').eq('product_id', productId).eq('customer_email', email).maybeSingle()
      );
      if (existing) throw conflict('This customer already reviewed this product.');
      const row = {
        id: bosId('rev'),
        product_id: productId,
        customer_email: email,
        rating,
        title,
        body,
        status: 'pending',
        verified_purchase: verified,
        created_at: new Date().toISOString(),
      };
      await db.from('reviews').insert(row);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'reviews.create',
        targetType: 'review',
        targetId: row.id,
        after: { productId, rating, verified },
        requestId: ctx.requestId,
      });
      return { review: row };
    },
  },

  reviewModerate: {
    permission: 'review.moderate',
    description: 'Publish or reject a review.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const decision = enumField(input, 'decision', ['publish', 'reject'] as const, { required: true });
      const status = decision === 'publish' ? 'published' : 'rejected';
      const review = await db.required<ReviewRow>(
        db.from('reviews').select('*').eq('id', id).maybeSingle(),
        'Review not found.'
      );
      await db.from('reviews').update({ status, moderated_by: ctx.actor.email }).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'reviews.moderate',
        targetType: 'review',
        targetId: id,
        before: { status: review.status },
        after: { status },
        requestId: ctx.requestId,
      });
      return { id, status };
    },
  },

  reviewRespond: {
    permission: 'review.moderate',
    description: 'Publish an official response to a review.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const response = stringField(input, 'response', { required: true, max: 4000 });
      const review = await db.required<ReviewRow>(
        db.from('reviews').select('*').eq('id', id).maybeSingle(),
        'Review not found.'
      );
      await db
        .from('reviews')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'reviews.respond',
        targetType: 'review',
        targetId: id,
        before: { response: review.response },
        after: { response },
        requestId: ctx.requestId,
      });
      return { id, response };
    },
  },

  reviewStats: {
    permission: 'review.read',
    description: 'Recorded rating distribution and verification rate.',
    handler: async () => {
      const rows = await db.rows<ReviewRow>(db.from('reviews').select('*').limit(50000));
      const published = rows.filter((review) => review.status === 'published');
      const distribution = new Map<number, number>();
      for (const review of published) {
        distribution.set(review.rating, (distribution.get(review.rating) || 0) + 1);
      }
      const verified = published.filter((review) => review.verified_purchase).length;
      return {
        total: rows.length,
        published: published.length,
        pending: rows.filter((review) => review.status === 'pending').length,
        averageRating: published.length
          ? Math.round((published.reduce((sum, review) => sum + intOrZero(review.rating), 0) / published.length) * 100) / 100
          : null,
        verifiedPercent: published.length ? Math.round((verified / published.length) * 1000) / 10 : null,
        distribution: Array.from({ length: 5 }, (_, index) => ({
          rating: index + 1,
          count: distribution.get(index + 1) || 0,
        })),
      };
    },
  },
};
