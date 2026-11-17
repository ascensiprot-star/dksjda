import express from 'express';
import { asRecord } from './core/repository';
import { db } from './core/repository';
import { BosError, badRequest } from './core/errors';
import { createCheckoutOrder } from './systems/orders';
import { emitAnalyticsEvent } from './core/events';

function idempotencyKey(req: express.Request, body: Record<string, unknown>): string {
  const header = req.header('idempotency-key');
  const value =
    (header && header.trim()) ||
    String(body.idempotencyKey || body.idempotency_key || '');
  return value;
}

/**
 * Public commerce routes.
 *
 * They are intentionally narrow: price configuration, checkout and a
 * consent-gated analytics intake. No read access to orders or customers is
 * exposed without an authenticated account.
 */
export function createCheckoutRouter(): express.Router {
  const router = express.Router();

  router.get('/config', async (_req, res) => {
    try {
      const settings = await db.one<{
        shippingRates?: unknown;
        freeShippingThreshold?: number | null;
        vatRate?: number | null;
      }>(
        db
          .from('settings')
          .select('shippingRates, freeShippingThreshold, vatRate')
          .eq('id', 'store')
          .maybeSingle()
      );
      res.json({
        shippingRates: Array.isArray(settings?.shippingRates) ? settings?.shippingRates : [],
        freeShippingThreshold: Number(settings?.freeShippingThreshold || 0),
        vatRate: Number(settings?.vatRate || 24),
        currency: 'EUR',
        checkoutEnabled: true,
      });
    } catch (error) {
      const status = error instanceof BosError ? error.status : 500;
      res.status(status).json({
        error: error instanceof BosError ? error.message : 'Could not load checkout configuration.',
        code: error instanceof BosError ? error.code : 'internal_error',
      });
    }
  });

  router.post('/checkout', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const key = idempotencyKey(req, body);
    try {
      if (!key) {
        throw badRequest('An Idempotency-Key header is required for checkout.');
      }
      const result = await createCheckoutOrder({
        customer: {
          email: String(asRecord(body.customer).email || ''),
          name: String(asRecord(body.customer).name || ''),
          phone: String(asRecord(body.customer).phone || ''),
          address: Object.keys(asRecord(asRecord(body.customer).address)).length
            ? {
                street: String(asRecord(asRecord(body.customer).address).street || ''),
                postalCode: String(asRecord(asRecord(body.customer).address).postalCode || ''),
                city: String(asRecord(asRecord(body.customer).address).city || ''),
                country: String(asRecord(asRecord(body.customer).address).country || ''),
              }
            : undefined,
        },
        items: (Array.isArray(body.items) ? body.items : []).map((raw) => {
          const item = asRecord(raw);
          return {
            productId: String(item.productId || ''),
            size: String(item.size || ''),
            quantity: Number(item.quantity || 0),
          };
        }),
        shippingMethod: String(body.shippingMethod || ''),
        discountCode: body.discountCode ? String(body.discountCode) : undefined,
        channel: body.channel ? String(body.channel) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        paymentMethod: body.paymentMethod ? String(body.paymentMethod) : undefined,
        idempotencyKey: key,
        consentBasis: body.consentBasis ? String(body.consentBasis) : undefined,
        attribution: asRecord(body.attribution),
      });
      res.status(201).json({
        order: {
          id: result.orderId,
          number: result.number,
          status: result.status,
          totals: result.totals,
          reservationExpiresAt: result.reservationExpiresAt || null,
        },
      });
    } catch (error) {
      if (error instanceof BosError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
          details: error.details,
          requestId: (req as express.Request & { requestId?: string }).requestId,
        });
        return;
      }
      console.error('[checkout] failed:', error instanceof Error ? error.message : error);
      res.status(500).json({
        error: 'Checkout failed. No order was created.',
        code: 'checkout_failed',
        requestId: (req as express.Request & { requestId?: string }).requestId,
      });
    }
  });

  /**
   * Consent-gated behavioural events. The tracker may also write directly to
   * Supabase under its anon policy; this endpoint exists for clients that keep
   * the write behind the API. Events are analytics-only and never transactional.
   */
  router.post('/events', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const visitorId = String(body.visitorId || '');
      const sessionId = String(body.sessionId || '');
      if (!visitorId || !sessionId) throw badRequest('visitorId and sessionId are required.');
      if (body.consent !== true) throw badRequest('Analytics consent is required.');
      await emitAnalyticsEvent({
        type: String(body.type || 'page_view').slice(0, 60),
        visitorId,
        sessionId,
        page: body.page ? String(body.page).slice(0, 500) : undefined,
        productId: body.productId ? String(body.productId) : undefined,
        channel: body.channel ? String(body.channel).slice(0, 60) : undefined,
        utm: asRecord(body.utm) as Record<string, string>,
        payload: asRecord(body.payload),
        timestamp: body.timestamp ? Number(body.timestamp) : undefined,
      });
      res.status(202).json({ accepted: true });
    } catch (error) {
      const status = error instanceof BosError ? error.status : 500;
      res.status(status).json({
        error: error instanceof BosError ? error.message : 'Event not recorded.',
        code: error instanceof BosError ? error.code : 'internal_error',
      });
    }
  });

  return router;
}
