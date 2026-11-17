import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import express from 'express';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';
import {
  saveTargetPlan,
  getActiveTargetPlan,
  lockPeriod,
  saveMetricActual,
  getMetricActuals,
  saveCoachTask,
  updateCoachTaskStatus,
  getCoachTasksForDate,
  saveDailyCoachBrief,
  getDailyCoachBrief,
  saveReverseFunnelCalculation,
  getLatestReverseFunnelCalculation,
} from './supabase/targetsService';
import {
  calculateGrowthRate,
  generateMonthlyTargets,
  applyGrowthCurve,
  generateDailyTargets,
  generateWeeklyTargets,
  calculateProgress,
  calculateCatchUp,
  calculateHitProbability,
  calculateReverseFunnel,
  generateDailyCoachTasks,
  generateDailyCoachBrief,
} from './services/targetCalculator';
import { supabase, isServiceClient } from './supabase/config';
import { logAuditEvent } from './supabase/dbService';
import {
  buildControlOverview,
  persistHealthResults,
  runControlProbes,
} from './controlPlane/probes';
import {
  acknowledgeAlert,
  addIncidentEvent,
  createDeployment,
  createIncident,
  loadAlerts,
  loadDeployments,
  loadHealthHistory,
  loadIncidents,
  loadSloStates,
  runDataQualityChecks,
  syncAlerts,
  updateIncident,
} from './controlPlane/visibility';
import {
  appendControlAudit,
  createChangeRequest,
  createVideoJobRun,
  decideChangeRequest,
  getFeatureFlag,
  getVideoJobRun,
  isFeatureEnabled,
  loadAuditEvents,
  loadChangeRequests,
  loadFeatureFlags,
  loadJobs,
  loadRunbooks,
  updateFeatureFlag,
  updateVideoJobRun,
} from './controlPlane/operations';
import {
  abortRunbookExecution,
  advanceRunbookExecution,
  createBackupDrill,
  createCostSnapshot,
  loadBackupDrills,
  loadCosts,
  loadRunbookExecutions,
  loadSecurity,
  recordAdminSession,
  recordSecurityEvent,
  saveCostBudget,
  startRunbookExecution,
  updateBackupDrill,
} from './controlPlane/hardening';
import { loadIntelligence } from './controlPlane/intelligence';
import { createBosRouter, createCheckoutRouter } from './bos';
import type { ControlCheckResult } from './controlPlane/types';
import type { AccountAddress, AccountOverview, Order } from './types';

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
function parseJson(req: express.Request, res: express.Response, next: express.NextFunction) {
  const limit = req.path === '/api/generate-video' ? '15mb' : '512kb';
  express.json({ limit, strict: false })(req, res, next);
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000;
const GENERAL_RATE_MAX = 120;
const UPLOAD_RATE_MAX = 10;
const rateHits = new Map<string, { count: number; resetAt: number }>();

const rateCleaner = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateHits) {
    if (entry.resetAt <= now) rateHits.delete(key);
  }
}, RATE_WINDOW_MS);
(rateCleaner as any).unref?.();

function rateLimit(max: number, bucket: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip ?? 'unknown'}|${bucket}`;
    const now = Date.now();
    let entry = rateHits.get(key);
    if (!entry || entry.resetAt <= now) {
      rateHits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    return next();
  };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
interface AuthedRequest extends express.Request {
  admin?: { id: string; email: string; role: string };
}

interface AuthedUserRequest extends express.Request {
  account?: {
    id: string;
    email: string;
    metadata: Record<string, unknown>;
    createdAt?: string;
    lastSignInAt?: string;
  };
}

const securityHash = (value: string): string =>
  createHash('sha256')
    .update(process.env.SECURITY_HASH_SALT || 'zejesh-control-plane')
    .update(value)
    .digest('hex')
    .slice(0, 32);

const requestIpHash = (req: express.Request): string | undefined => {
  const ip = req.ip || req.socket.remoteAddress;
  return ip ? securityHash(ip) : undefined;
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(decoded);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
};

const sessionTouches = new Map<string, number>();
const SESSION_TOUCH_MS = 60_000;

const touchAdminSession = (
  req: express.Request,
  admin: { id: string; email: string; role: string },
  token: string
) => {
  const payload = decodeJwtPayload(token);
  const sessionId = payload?.session_id
    ? String(payload.session_id)
    : `token-${securityHash(token)}`;
  const now = Date.now();
  const lastTouch = sessionTouches.get(sessionId) || 0;
  if (now - lastTouch < SESSION_TOUCH_MS) return;
  sessionTouches.set(sessionId, now);
  const issuedAt =
    typeof payload?.iat === 'number' ? new Date(payload.iat * 1000).toISOString() : undefined;
  const expiresAt =
    typeof payload?.exp === 'number' ? new Date(payload.exp * 1000).toISOString() : undefined;
  void recordAdminSession({
    sessionId,
    adminId: admin.id,
    email: admin.email,
    role: admin.role,
    issuedAt,
    expiresAt,
    ipHash: requestIpHash(req),
    userAgent: req.header('user-agent') || undefined,
  }).catch((err) => console.error('[security] session record failed:', err));
};

const recordDeniedAccess = (
  req: express.Request,
  input: {
    eventType: string;
    actorEmail?: string;
    actorId?: string;
    role?: string;
    severity?: string;
    details?: Record<string, unknown>;
  }
) => {
  void recordSecurityEvent({
    eventType: input.eventType,
    actorEmail: input.actorEmail,
    actorId: input.actorId,
    role: input.role,
    outcome: 'denied',
    severity: input.severity || 'low',
    ipHash: requestIpHash(req),
    userAgent: req.header('user-agent') || undefined,
    requestId: (req as InstrumentedRequest).requestId,
    details: input.details,
  }).catch((err) => console.error('[security] denied access record failed:', err));
};

async function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!isServiceClient) {
    console.error(
      '[auth] Refusing /api access: SUPABASE_SERVICE_ROLE_KEY is not configured on the server.'
    );
    return res.status(503).json({
      error: 'Backend authentication service unavailable.',
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty bearer token.' });
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      recordDeniedAccess(req, {
        eventType: 'admin.session.invalid',
        severity: 'medium',
        details: { reason: userError?.message || 'Token has no verified email.' },
      });
      return res.status(401).json({ error: 'Invalid or expired session token.' });
    }

    const email = userData.user.email.toLowerCase().trim();

    const { data: adminRow, error: adminError } = await supabase
      .from('admins')
      .select('id, email, role')
      .eq('email', email)
      .maybeSingle();

    if (adminError) {
      recordDeniedAccess(req, {
        eventType: 'admin.access.check_failed',
        actorEmail: email,
        actorId: userData.user.id,
        severity: 'high',
        details: { reason: adminError.message },
      });
      return res.status(500).json({ error: 'Administrator lookup failed.' });
    }

    if (!adminRow) {
      recordDeniedAccess(req, {
        eventType: 'admin.access.forbidden',
        actorEmail: email,
        actorId: userData.user.id,
        severity: 'high',
        details: { reason: 'Verified user is not in the admins table.' },
      });
      return res.status(403).json({
        error: 'Forbidden: authenticated user is not an administrator.',
      });
    }

    (req as AuthedRequest).admin = adminRow;
    touchAdminSession(req, adminRow, token);
    return next();
  } catch (err) {
    console.error('[auth] Verification failed unexpectedly:', err);
    return res.status(500).json({ error: 'Failed to verify authentication.' });
  }
}

/**
 * Customer account authentication.
 *
 * Unlike requireAdmin, this accepts any verified Supabase user. The service
 * client stays on the server and is used only after the caller's JWT has been
 * verified, so patron order history can be read without exposing order rows to
 * anonymous or unrelated accounts.
 */
async function requireUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!isServiceClient) {
    console.error(
      '[auth] Refusing /api/account access: SUPABASE_SERVICE_ROLE_KEY is not configured on the server.'
    );
    return res.status(503).json({ error: 'Account service unavailable.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty bearer token.' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    const user = data?.user;
    if (error || !user?.email) {
      return res.status(401).json({ error: 'Invalid or expired session token.' });
    }

    (req as AuthedUserRequest).account = {
      id: user.id,
      email: user.email.toLowerCase().trim(),
      metadata:
        user.user_metadata && typeof user.user_metadata === 'object'
          ? (user.user_metadata as Record<string, unknown>)
          : {},
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
    };
    return next();
  } catch (err) {
    console.error('[auth] Customer verification failed unexpectedly:', err);
    return res.status(500).json({ error: 'Failed to verify account session.' });
  }
}

// ---------------------------------------------------------------------------
// Control-plane helpers
// ---------------------------------------------------------------------------
interface InstrumentedRequest extends express.Request {
  requestId?: string;
}

const requestBaseUrl = (req: express.Request): string | null => {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  if (!host) return null;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const proto = protoHeader?.split(',')[0]?.trim() || req.protocol || 'http';
  return `${proto}://${host}`;
};

const statusFromChecks = (checks: ControlCheckResult[]) => {
  if (checks.some((check) => check.status === 'down')) return 'down' as const;
  if (checks.some((check) => check.status === 'not_configured')) return 'not_configured' as const;
  if (checks.some((check) => check.status === 'degraded')) return 'degraded' as const;
  return 'operational' as const;
};

const auditControlRequest = (
  req: express.Request,
  input: {
    action: string;
    targetType?: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
    approvalId?: string;
  }
) => {
  const admin = (req as AuthedRequest).admin;
  void appendControlAudit({
    actorId: admin?.id,
    actorEmail: admin?.email || 'unknown-admin',
    role: admin?.role,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before,
    after: input.after,
    approvalId: input.approvalId,
    requestId: (req as InstrumentedRequest).requestId,
  }).catch((err) => console.error('[control] audit append failed:', err));
};

const normalizeAddress = (value: unknown): AccountAddress | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const street = typeof raw.street === 'string' ? raw.street.trim() : '';
  const postalCode = typeof raw.postalCode === 'string' ? raw.postalCode.trim() : '';
  const city = typeof raw.city === 'string' ? raw.city.trim() : '';
  const country = typeof raw.country === 'string' ? raw.country.trim() : '';
  if (!street && !postalCode && !city && !country) return null;
  return { street, postalCode, city, country };
};

async function loadAccountOrders(email: string): Promise<Order[]> {
  const filtered = await supabase
    .from('orders')
    .select('*')
    .filter('customer->>email', 'ilike', email)
    .order('createdAt', { ascending: false })
    .limit(100);

  if (!filtered.error && Array.isArray(filtered.data)) {
    return filtered.data as Order[];
  }

  // Defensive fallback for deployments where the JSON path filter is
  // unavailable. Only the signed-in account's rows are returned.
  const fallback = await supabase
    .from('orders')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(300);
  if (fallback.error || !Array.isArray(fallback.data)) return [];
  return (fallback.data as Order[]).filter(
    (order) => (order.customer?.email || '').toLowerCase().trim() === email
  );
}

// ---------------------------------------------------------------------------
// Application Setup
// ---------------------------------------------------------------------------
export function createExpressApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  }

  app.use(parseJson);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use((req, res, next) => {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && /^[a-zA-Z0-9._-]{8,80}$/.test(incoming) ? incoming : randomUUID();
    (req as InstrumentedRequest).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();
    const instrumented = req.path.startsWith('/api') || req.path.startsWith('/health');

    if (instrumented) {
      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        console.info(
          JSON.stringify({
            type: 'http.request.completed',
            requestId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            at: new Date().toISOString(),
          })
        );
      });
    }

    next();
  });

  // Public liveness and readiness probes. They expose no secrets and do not
  // require an operator session.
  app.get('/health/live', (req, res) => {
    res.json({
      status: 'ok',
      service: 'zejesh-api',
      timestamp: new Date().toISOString(),
      requestId: (req as InstrumentedRequest).requestId,
    });
  });

  app.get('/health/ready', async (req, res) => {
    const checks = await runControlProbes({
      baseUrl: requestBaseUrl(req),
      requestId: (req as InstrumentedRequest).requestId || 'unknown',
    });
    const status = statusFromChecks(checks);
    res.status(status === 'down' || status === 'not_configured' ? 503 : 200).json({
      status,
      checkedAt: new Date().toISOString(),
      requestId: (req as InstrumentedRequest).requestId,
      checks: checks.map((check) => ({
        id: check.id,
        serviceId: check.serviceId,
        name: check.name,
        status: check.status,
        latencyMs: check.latencyMs,
        message: check.message,
      })),
    });
  });

  app.get('/health/deep', requireAdmin, async (req, res) => {
    const overview = await buildControlOverview({
      baseUrl: requestBaseUrl(req),
      requestId: (req as InstrumentedRequest).requestId || 'unknown',
    });
    res.json(overview);
  });

  // Vercel Cron / external scheduler entry point. It must not use an operator
  // session, but it must fail closed if CRON_SECRET is not configured.
  app.get('/api/cron/health', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const authorization = req.header('authorization');
    if (!secret || authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Cron authorization failed.' });
    }

    try {
      const checks = await runControlProbes({
        baseUrl: requestBaseUrl(req),
        requestId: (req as InstrumentedRequest).requestId || 'cron',
      });
      const persistence = await persistHealthResults(checks);
      const alerts = await syncAlerts(checks).then(
        () => ({ synced: true, message: 'Alert state reconciled.' }),
        (err: unknown) => ({
          synced: false,
          message: err instanceof Error ? err.message : 'Alert reconciliation failed.',
        })
      );
      return res.json({
        generatedAt: new Date().toISOString(),
        status: statusFromChecks(checks),
        checks: checks.length,
        persistence,
        alerts,
      });
    } catch (err: any) {
      console.error('[control] cron health failed:', err);
      return res.status(500).json({ error: err?.message || 'Cron health run failed.' });
    }
  });

  app.use('/api', rateLimit(GENERAL_RATE_MAX, 'api'));

  // -------------------------------------------------------------------------
  // Patron account — authenticated customer session, service client on server
  // -------------------------------------------------------------------------
  app.use('/api/account', requireUser);

  app.get('/api/account/overview', async (req, res) => {
    const account = (req as AuthedUserRequest).account;
    if (!account) return res.status(401).json({ error: 'Account session missing.' });

    try {
      const { data: customerRows, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .ilike('email', account.email)
        .limit(1);

      if (customerError) {
        console.warn('[account] customer lookup failed:', customerError.message);
      }

      const orders = await loadAccountOrders(account.email);
      const profileAddress = normalizeAddress(account.metadata.address);
      const addressMap = new Map<string, AccountAddress>();

      const rememberAddress = (address: AccountAddress | null | undefined) => {
        if (!address) return;
        const key = [
          address.street,
          address.postalCode,
          address.city,
          address.country,
        ]
          .join('|')
          .toLowerCase();
        if (!addressMap.has(key)) addressMap.set(key, address);
      };

      rememberAddress(profileAddress);
      for (const order of orders) {
        rememberAddress(normalizeAddress(order.customer?.address));
      }

      const customer = customerRows?.[0] || null;
      const payload: AccountOverview = {
        user: {
          id: account.id,
          email: account.email,
          fullName:
            typeof account.metadata.full_name === 'string'
              ? account.metadata.full_name
              : customer?.name || '',
          phone: typeof account.metadata.phone === 'string' ? account.metadata.phone : '',
          address: profileAddress,
          createdAt: account.createdAt,
          lastSignInAt: account.lastSignInAt,
        },
        customer,
        orders,
        addresses: Array.from(addressMap.values()),
        generatedAt: new Date().toISOString(),
      };

      return res.json(payload);
    } catch (err: any) {
      console.error('[account] overview failed:', err);
      return res.status(500).json({ error: 'Could not load account overview.' });
    }
  });

  app.patch('/api/account/profile', async (req, res) => {
    const account = (req as AuthedUserRequest).account;
    if (!account) return res.status(401).json({ error: 'Account session missing.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fullName =
      typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 120) : undefined;
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : undefined;
    const hasAddress = Object.prototype.hasOwnProperty.call(body, 'address');
    const address = hasAddress ? normalizeAddress(body.address) : undefined;
    const marketingConsent =
      typeof body.marketingConsent === 'boolean' ? body.marketingConsent : undefined;

    try {
      const nextMetadata: Record<string, unknown> = {
        ...account.metadata,
        ...(fullName !== undefined ? { full_name: fullName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(hasAddress ? { address } : {}),
      };

      const { data: updated, error: userError } = await supabase.auth.admin.updateUserById(
        account.id,
        { user_metadata: nextMetadata }
      );
      if (userError) {
        return res.status(500).json({ error: 'Could not update account profile.' });
      }

      if (marketingConsent !== undefined || fullName !== undefined) {
        const { error: customerError } = await supabase
          .from('customers')
          .update({
            ...(fullName !== undefined ? { name: fullName } : {}),
            ...(marketingConsent !== undefined ? { marketingConsent } : {}),
          })
          .ilike('email', account.email);
        if (customerError) {
          console.warn('[account] customer profile update failed:', customerError.message);
        }
      }

      const metadata =
        updated?.user?.user_metadata && typeof updated.user.user_metadata === 'object'
          ? (updated.user.user_metadata as Record<string, unknown>)
          : nextMetadata;

      return res.json({
        user: {
          id: account.id,
          email: account.email,
          fullName: typeof metadata.full_name === 'string' ? metadata.full_name : '',
          phone: typeof metadata.phone === 'string' ? metadata.phone : '',
          address: normalizeAddress(metadata.address),
          createdAt: account.createdAt,
          lastSignInAt: account.lastSignInAt,
        },
      });
    } catch (err: any) {
      console.error('[account] profile update failed:', err);
      return res.status(500).json({ error: 'Could not update account profile.' });
    }
  });

  // Public commerce surface. Checkout is authenticated by a verified product
  // catalogue and idempotency key, not by an admin session.
  app.use('/api/commerce', createCheckoutRouter());

  app.use('/api', requireAdmin);

  // Authenticated BOS dispatcher. Every action is declared in the registry with
  // an explicit permission; the dispatcher never reflects over object keys.
  app.use('/api/bos', createBosRouter());

  // -------------------------------------------------------------------------
  // Control plane — phase 0
  // -------------------------------------------------------------------------
  app.get('/api/control/overview', async (req, res) => {
    try {
      const overview = await buildControlOverview({
        baseUrl: requestBaseUrl(req),
        requestId: (req as InstrumentedRequest).requestId || 'unknown',
      });
      res.json(overview);
    } catch (err: any) {
      console.error('[control] overview failed:', err);
      res.status(500).json({ error: err?.message || 'Control overview failed.' });
    }
  });

  app.get('/api/control/services', async (req, res) => {
    try {
      const overview = await buildControlOverview({
        baseUrl: requestBaseUrl(req),
        requestId: (req as InstrumentedRequest).requestId || 'unknown',
      });
      res.json({ generatedAt: overview.generatedAt, services: overview.services });
    } catch (err: any) {
      console.error('[control] service read failed:', err);
      res.status(500).json({ error: err?.message || 'Service read failed.' });
    }
  });

  app.get('/api/control/health', async (req, res) => {
    try {
      const checks = await runControlProbes({
        baseUrl: requestBaseUrl(req),
        requestId: (req as InstrumentedRequest).requestId || 'unknown',
      });
      res.json({
        generatedAt: new Date().toISOString(),
        status: statusFromChecks(checks),
        checks,
      });
    } catch (err: any) {
      console.error('[control] health read failed:', err);
      res.status(500).json({ error: err?.message || 'Health read failed.' });
    }
  });

  app.post('/api/control/health/run', async (req, res) => {
    try {
      const checks = await runControlProbes({
        baseUrl: requestBaseUrl(req),
        requestId: (req as InstrumentedRequest).requestId || 'unknown',
      });
      const persistence = await persistHealthResults(checks);
      const alerts = await syncAlerts(checks).then(
        () => ({ synced: true, message: 'Alert state reconciled.' }),
        (err: unknown) => ({
          synced: false,
          message: err instanceof Error ? err.message : 'Alert reconciliation failed.',
        })
      );
      const adminEmail = (req as AuthedRequest).admin?.email || 'unknown-admin';
      void logAuditEvent(adminEmail, 'CONTROL_HEALTH_RUN', 'Control plane health checks', {
        persisted: persistence.persisted,
        checks: checks.length,
        alertsSynced: alerts.synced,
        requestId: (req as InstrumentedRequest).requestId,
      });
      auditControlRequest(req, {
        action: 'control.health.run',
        targetType: 'control',
        targetId: 'health',
        after: {
          persisted: persistence.persisted,
          checks: checks.length,
          alertsSynced: alerts.synced,
        },
      });
      res.json({
        generatedAt: new Date().toISOString(),
        status: statusFromChecks(checks),
        checks,
        persistence,
        alerts,
      });
    } catch (err: any) {
      console.error('[control] health run failed:', err);
      res.status(500).json({ error: err?.message || 'Health run failed.' });
    }
  });

  app.get('/api/control/history', async (req, res) => {
    try {
      const hours = Number(req.query.hours || 24);
      const history = await loadHealthHistory(Number.isFinite(hours) ? hours : 24);
      res.json(history);
    } catch (err: any) {
      console.error('[control] history read failed:', err);
      res.status(500).json({ error: err?.message || 'History read failed.' });
    }
  });

  app.get('/api/control/slo', async (_req, res) => {
    try {
      res.json(await loadSloStates());
    } catch (err: any) {
      console.error('[control] SLO read failed:', err);
      res.status(500).json({ error: err?.message || 'SLO read failed.' });
    }
  });

  app.get('/api/control/alerts', async (_req, res) => {
    try {
      res.json(await loadAlerts());
    } catch (err: any) {
      console.error('[control] alert read failed:', err);
      res.status(500).json({ error: err?.message || 'Alert read failed.' });
    }
  });

  app.post('/api/control/alerts/:id/ack', async (req, res) => {
    try {
      const alert = await acknowledgeAlert(req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found or already resolved.' });
      const adminEmail = (req as AuthedRequest).admin?.email || 'unknown-admin';
      void logAuditEvent(adminEmail, 'CONTROL_ALERT_ACK', alert.id, {
        title: alert.title,
        severity: alert.severity,
      });
      auditControlRequest(req, {
        action: 'control.alert.acknowledge',
        targetType: 'alert',
        targetId: alert.id,
        after: { title: alert.title, severity: alert.severity },
      });
      res.json(alert);
    } catch (err: any) {
      console.error('[control] alert acknowledgement failed:', err);
      res.status(500).json({ error: err?.message || 'Alert acknowledgement failed.' });
    }
  });

  app.get('/api/control/incidents', async (req, res) => {
    try {
      const includeResolved = req.query.includeResolved === '1' || req.query.includeResolved === 'true';
      res.json(await loadIncidents(includeResolved));
    } catch (err: any) {
      console.error('[control] incident read failed:', err);
      res.status(500).json({ error: err?.message || 'Incident read failed.' });
    }
  });

  app.post('/api/control/incidents', async (req, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'Incident title is required.' });
      const adminEmail = (req as AuthedRequest).admin?.email || 'unknown-admin';
      const incident = await createIncident(
        {
          title,
          summary: typeof req.body?.summary === 'string' ? req.body.summary : '',
          severity: typeof req.body?.severity === 'string' ? req.body.severity : 'SEV3',
          serviceIds: Array.isArray(req.body?.serviceIds) ? req.body.serviceIds.map(String) : [],
          impact: typeof req.body?.impact === 'string' ? req.body.impact : '',
        },
        adminEmail
      );
      void logAuditEvent(adminEmail, 'CONTROL_INCIDENT_DECLARED', incident.id, {
        title: incident.title,
        severity: incident.severity,
        serviceIds: incident.serviceIds,
      });
      auditControlRequest(req, {
        action: 'control.incident.declare',
        targetType: 'incident',
        targetId: incident.id,
        after: incident,
      });
      res.status(201).json(incident);
    } catch (err: any) {
      console.error('[control] incident declaration failed:', err);
      res.status(500).json({ error: err?.message || 'Incident declaration failed.' });
    }
  });

  app.post('/api/control/incidents/:id/events', async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Incident note is required.' });
      const adminEmail = (req as AuthedRequest).admin?.email || 'unknown-admin';
      const event = await addIncidentEvent(req.params.id, message, adminEmail);
      if (!event) return res.status(404).json({ error: 'Incident not found.' });
      auditControlRequest(req, {
        action: 'control.incident.note',
        targetType: 'incident',
        targetId: req.params.id,
        after: { message },
      });
      res.status(201).json(event);
    } catch (err: any) {
      console.error('[control] incident note failed:', err);
      res.status(500).json({ error: err?.message || 'Incident note failed.' });
    }
  });

  app.patch('/api/control/incidents/:id', async (req, res) => {
    try {
      const adminEmail = (req as AuthedRequest).admin?.email || 'unknown-admin';
      const incident = await updateIncident(
        req.params.id,
        {
          status: typeof req.body?.status === 'string' ? req.body.status : undefined,
          summary: typeof req.body?.summary === 'string' ? req.body.summary : undefined,
          impact: typeof req.body?.impact === 'string' ? req.body.impact : undefined,
          commander: typeof req.body?.commander === 'string' ? req.body.commander : undefined,
        },
        adminEmail
      );
      if (!incident) return res.status(404).json({ error: 'Incident not found.' });
      void logAuditEvent(adminEmail, 'CONTROL_INCIDENT_UPDATED', incident.id, {
        status: incident.status,
      });
      auditControlRequest(req, {
        action: 'control.incident.update',
        targetType: 'incident',
        targetId: incident.id,
        after: incident,
      });
      res.json(incident);
    } catch (err: any) {
      console.error('[control] incident update failed:', err);
      res.status(500).json({ error: err?.message || 'Incident update failed.' });
    }
  });

  app.get('/api/control/deployments', async (_req, res) => {
    try {
      res.json(await loadDeployments());
    } catch (err: any) {
      console.error('[control] deployment read failed:', err);
      res.status(500).json({ error: err?.message || 'Deployment read failed.' });
    }
  });

  app.post('/api/control/deployments', async (req, res) => {
    try {
      const version = String(req.body?.version || '').trim();
      if (!version) return res.status(400).json({ error: 'Deployment version is required.' });
      const adminEmail = (req as AuthedRequest).admin?.email || 'unknown-admin';
      const deployment = await createDeployment(
        {
          version,
          environment: typeof req.body?.environment === 'string' ? req.body.environment : undefined,
          commitSha: typeof req.body?.commitSha === 'string' ? req.body.commitSha : undefined,
          status: typeof req.body?.status === 'string' ? req.body.status : undefined,
        },
        adminEmail
      );
      void logAuditEvent(adminEmail, 'CONTROL_DEPLOYMENT_RECORDED', deployment.id, {
        version: deployment.version,
        environment: deployment.environment,
        status: deployment.status,
      });
      auditControlRequest(req, {
        action: 'control.deployment.record',
        targetType: 'deployment',
        targetId: deployment.id,
        after: deployment,
      });
      res.status(201).json(deployment);
    } catch (err: any) {
      console.error('[control] deployment record failed:', err);
      res.status(500).json({ error: err?.message || 'Deployment record failed.' });
    }
  });

  app.get('/api/control/data-quality', async (_req, res) => {
    try {
      res.json(await runDataQualityChecks(false));
    } catch (err: any) {
      console.error('[control] data-quality read failed:', err);
      res.status(500).json({ error: err?.message || 'Data-quality read failed.' });
    }
  });

  app.post('/api/control/data-quality/run', async (req, res) => {
    try {
      const result = await runDataQualityChecks(true);
      const admin = (req as AuthedRequest).admin;
      void logAuditEvent(admin?.email || 'unknown-admin', 'CONTROL_DATA_QUALITY_RUN', 'Data-quality checks', {
        persisted: result.persisted,
        checks: result.checks.length,
      });
      void appendControlAudit({
        actorId: admin?.id,
        actorEmail: admin?.email || 'unknown-admin',
        role: admin?.role,
        action: 'control.data_quality.run',
        targetType: 'control',
        targetId: 'data-quality',
        after: { persisted: result.persisted, checks: result.checks.length },
        requestId: (req as InstrumentedRequest).requestId,
      }).catch((err) => console.error('[control] audit append failed:', err));
      res.json(result);
    } catch (err: any) {
      console.error('[control] data-quality run failed:', err);
      res.status(500).json({ error: err?.message || 'Data-quality run failed.' });
    }
  });

  app.get('/api/control/intelligence', async (req, res) => {
    try {
      const windowDays = Number(req.query.days || 30);
      const baselineDays = Number(req.query.baselineDays || 14);
      res.json(
        await loadIntelligence({
          windowDays: Number.isFinite(windowDays) ? windowDays : 30,
          baselineDays: Number.isFinite(baselineDays) ? baselineDays : 14,
        })
      );
    } catch (err: any) {
      console.error('[control] intelligence read failed:', err);
      res.status(500).json({ error: err?.message || 'Intelligence read failed.' });
    }
  });

  app.get('/api/control/jobs', async (_req, res) => {
    try {
      res.json(await loadJobs());
    } catch (err: any) {
      console.error('[control] job read failed:', err);
      res.status(500).json({ error: err?.message || 'Job read failed.' });
    }
  });

  app.get('/api/control/flags', async (_req, res) => {
    try {
      res.json(await loadFeatureFlags());
    } catch (err: any) {
      console.error('[control] flag read failed:', err);
      res.status(500).json({ error: err?.message || 'Feature-flag read failed.' });
    }
  });

  app.patch('/api/control/flags/:key', async (req, res) => {
    try {
      const key = String(req.params.key || '').trim();
      if (!key) return res.status(400).json({ error: 'Flag key is required.' });
      const admin = (req as AuthedRequest).admin;
      const before = await getFeatureFlag(key);
      if (!before) return res.status(404).json({ error: 'Feature flag not found.' });

      const flag = await updateFeatureFlag(
        key,
        {
          enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
          rolloutPercent:
            typeof req.body?.rolloutPercent === 'number' ? req.body.rolloutPercent : undefined,
          description:
            typeof req.body?.description === 'string' ? req.body.description : undefined,
        },
        admin?.email || 'unknown-admin'
      );
      if (!flag) return res.status(404).json({ error: 'Feature flag not found.' });

      void logAuditEvent(admin?.email || 'unknown-admin', 'CONTROL_FLAG_UPDATED', key, {
        enabled: flag.enabled,
        rolloutPercent: flag.rolloutPercent,
      });
      void appendControlAudit({
        actorId: admin?.id,
        actorEmail: admin?.email || 'unknown-admin',
        role: admin?.role,
        action: 'control.feature_flag.update',
        targetType: 'feature_flag',
        targetId: key,
        before,
        after: flag,
        requestId: (req as InstrumentedRequest).requestId,
      }).catch((err) => console.error('[control] audit append failed:', err));

      res.json(flag);
    } catch (err: any) {
      console.error('[control] flag update failed:', err);
      res.status(500).json({ error: err?.message || 'Feature-flag update failed.' });
    }
  });

  app.get('/api/control/runbooks', async (_req, res) => {
    try {
      res.json(await loadRunbooks());
    } catch (err: any) {
      console.error('[control] runbook read failed:', err);
      res.status(500).json({ error: err?.message || 'Runbook read failed.' });
    }
  });

  app.get('/api/control/change-requests', async (_req, res) => {
    try {
      res.json(await loadChangeRequests());
    } catch (err: any) {
      console.error('[control] change-request read failed:', err);
      res.status(500).json({ error: err?.message || 'Change-request read failed.' });
    }
  });

  app.post('/api/control/change-requests', async (req, res) => {
    try {
      const action = String(req.body?.action || '').trim();
      const reason = String(req.body?.reason || '').trim();
      if (!action || !reason) {
        return res.status(400).json({ error: 'Action and reason are required.' });
      }
      const admin = (req as AuthedRequest).admin;
      const request = await createChangeRequest(
        {
          action,
          targetType: String(req.body?.targetType || 'resource'),
          targetId: typeof req.body?.targetId === 'string' ? req.body.targetId : undefined,
          reason,
          payload:
            req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {},
        },
        admin?.email || 'unknown-admin'
      );
      void logAuditEvent(admin?.email || 'unknown-admin', 'CONTROL_CHANGE_REQUESTED', request.id, {
        action: request.action,
        targetType: request.targetType,
        targetId: request.targetId,
      });
      void appendControlAudit({
        actorId: admin?.id,
        actorEmail: admin?.email || 'unknown-admin',
        role: admin?.role,
        action: 'control.change_request.create',
        targetType: 'change_request',
        targetId: request.id,
        after: request,
        requestId: (req as InstrumentedRequest).requestId,
      }).catch((err) => console.error('[control] audit append failed:', err));
      res.status(201).json(request);
    } catch (err: any) {
      console.error('[control] change-request create failed:', err);
      res.status(500).json({ error: err?.message || 'Change request failed.' });
    }
  });

  app.post('/api/control/change-requests/:id/decide', async (req, res) => {
    try {
      const admin = (req as AuthedRequest).admin;
      if (admin?.role !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can approve or reject change requests.' });
      }
      const decision = String(req.body?.decision || '');
      if (decision !== 'approved' && decision !== 'rejected') {
        return res.status(400).json({ error: 'Decision must be approved or rejected.' });
      }
      const request = await decideChangeRequest(req.params.id, decision, admin?.email || 'unknown-admin');
      if (!request) return res.status(404).json({ error: 'Pending change request not found.' });
      void logAuditEvent(admin?.email || 'unknown-admin', 'CONTROL_CHANGE_DECIDED', request.id, {
        decision: request.status,
      });
      void appendControlAudit({
        actorId: admin?.id,
        actorEmail: admin?.email || 'unknown-admin',
        role: admin?.role,
        action: 'control.change_request.decide',
        targetType: 'change_request',
        targetId: request.id,
        after: request,
        requestId: (req as InstrumentedRequest).requestId,
      }).catch((err) => console.error('[control] audit append failed:', err));
      res.json(request);
    } catch (err: any) {
      console.error('[control] change-request decision failed:', err);
      res.status(500).json({ error: err?.message || 'Change request decision failed.' });
    }
  });

  app.get('/api/control/audit', async (req, res) => {
    try {
      const limit = Number(req.query.limit || 100);
      res.json(await loadAuditEvents(Number.isFinite(limit) ? limit : 100));
    } catch (err: any) {
      console.error('[control] audit read failed:', err);
      res.status(500).json({ error: err?.message || 'Audit read failed.' });
    }
  });

  // -------------------------------------------------------------------------
  // Control plane — hardening
  // -------------------------------------------------------------------------
  app.get('/api/control/costs', async (_req, res) => {
    try {
      res.json(await loadCosts());
    } catch (err: any) {
      console.error('[control] cost read failed:', err);
      res.status(500).json({ error: err?.message || 'Cost read failed.' });
    }
  });

  app.post('/api/control/costs/snapshots', async (req, res) => {
    try {
      const provider = String(req.body?.provider || '').trim();
      const periodStart = String(req.body?.periodStart || '').trim();
      const periodEnd = String(req.body?.periodEnd || '').trim();
      const amount = Number(req.body?.amount);
      if (!provider || !periodStart || !periodEnd) {
        return res.status(400).json({ error: 'Provider, period start and period end are required.' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
        return res.status(400).json({ error: 'Period dates must use YYYY-MM-DD.' });
      }
      if (periodEnd < periodStart) {
        return res.status(400).json({ error: 'Period end must not be before period start.' });
      }
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: 'Amount must be a non-negative number.' });
      }
      const admin = (req as AuthedRequest).admin;
      const snapshot = await createCostSnapshot(
        {
          provider,
          serviceId: typeof req.body?.serviceId === 'string' ? req.body.serviceId : undefined,
          periodStart,
          periodEnd,
          amount,
          currency: typeof req.body?.currency === 'string' ? req.body.currency : undefined,
          source: typeof req.body?.source === 'string' ? req.body.source : 'manual',
          details:
            req.body?.details && typeof req.body.details === 'object' ? req.body.details : {},
        },
        admin?.email || 'unknown-admin'
      );
      auditControlRequest(req, {
        action: 'control.cost_snapshot.create',
        targetType: 'cost_snapshot',
        targetId: snapshot.id,
        after: snapshot,
      });
      res.status(201).json(snapshot);
    } catch (err: any) {
      console.error('[control] cost snapshot create failed:', err);
      res.status(500).json({ error: err?.message || 'Cost snapshot failed.' });
    }
  });

  app.post('/api/control/costs/budgets', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const provider = String(req.body?.provider || '').trim();
      const monthlyLimit = Number(req.body?.monthlyLimit);
      if (!name || !provider) {
        return res.status(400).json({ error: 'Budget name and provider are required.' });
      }
      if (!Number.isFinite(monthlyLimit) || monthlyLimit < 0) {
        return res.status(400).json({ error: 'Monthly limit must be a non-negative number.' });
      }
      const admin = (req as AuthedRequest).admin;
      const budget = await saveCostBudget(
        {
          id: typeof req.body?.id === 'string' ? req.body.id : undefined,
          name,
          provider,
          serviceId: typeof req.body?.serviceId === 'string' ? req.body.serviceId : undefined,
          monthlyLimit,
          currency: typeof req.body?.currency === 'string' ? req.body.currency : undefined,
          alertThresholdPercent:
            typeof req.body?.alertThresholdPercent === 'number'
              ? req.body.alertThresholdPercent
              : undefined,
          enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
          owner: typeof req.body?.owner === 'string' ? req.body.owner : undefined,
        },
        admin?.email || 'unknown-admin'
      );
      auditControlRequest(req, {
        action: 'control.cost_budget.save',
        targetType: 'cost_budget',
        targetId: budget.id,
        after: budget,
      });
      res.status(201).json(budget);
    } catch (err: any) {
      console.error('[control] cost budget save failed:', err);
      res.status(500).json({ error: err?.message || 'Cost budget failed.' });
    }
  });

  app.get('/api/control/security', async (_req, res) => {
    try {
      res.json(await loadSecurity());
    } catch (err: any) {
      console.error('[control] security read failed:', err);
      res.status(500).json({ error: err?.message || 'Security read failed.' });
    }
  });

  app.get('/api/control/backups', async (_req, res) => {
    try {
      res.json(await loadBackupDrills());
    } catch (err: any) {
      console.error('[control] backup read failed:', err);
      res.status(500).json({ error: err?.message || 'Backup read failed.' });
    }
  });

  app.post('/api/control/backups', async (req, res) => {
    try {
      const environment = String(req.body?.environment || '').trim();
      const backupSource = String(req.body?.backupSource || '').trim();
      const restoreTarget = String(req.body?.restoreTarget || '').trim();
      if (!environment || !backupSource || !restoreTarget) {
        return res.status(400).json({
          error: 'Environment, backup source and restore target are required.',
        });
      }
      const allowedStatuses = new Set(['planned', 'running', 'passed', 'failed']);
      const status = String(req.body?.status || 'planned');
      if (!allowedStatuses.has(status)) {
        return res.status(400).json({ error: 'Invalid backup drill status.' });
      }
      const admin = (req as AuthedRequest).admin;
      const drill = await createBackupDrill(
        {
          environment,
          backupSource,
          restoreTarget,
          status: status as 'planned' | 'running' | 'passed' | 'failed',
          startedAt: typeof req.body?.startedAt === 'string' ? req.body.startedAt : undefined,
          completedAt: typeof req.body?.completedAt === 'string' ? req.body.completedAt : undefined,
          rpoMinutes: Number.isFinite(Number(req.body?.rpoMinutes))
            ? Number(req.body.rpoMinutes)
            : null,
          rtoMinutes: Number.isFinite(Number(req.body?.rtoMinutes))
            ? Number(req.body.rtoMinutes)
            : null,
          verifiedTables: Number.isFinite(Number(req.body?.verifiedTables))
            ? Number(req.body.verifiedTables)
            : null,
          verifiedRows: Number.isFinite(Number(req.body?.verifiedRows))
            ? Number(req.body.verifiedRows)
            : null,
          checksum: typeof req.body?.checksum === 'string' ? req.body.checksum : undefined,
          notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
          details:
            req.body?.details && typeof req.body.details === 'object' ? req.body.details : {},
        },
        admin?.email || 'unknown-admin'
      );
      auditControlRequest(req, {
        action: 'control.backup_drill.create',
        targetType: 'backup_drill',
        targetId: drill.id,
        after: drill,
      });
      res.status(201).json(drill);
    } catch (err: any) {
      console.error('[control] backup drill create failed:', err);
      res.status(500).json({ error: err?.message || 'Backup drill failed.' });
    }
  });

  app.patch('/api/control/backups/:id', async (req, res) => {
    try {
      const allowedStatuses = new Set(['planned', 'running', 'passed', 'failed']);
      const status =
        typeof req.body?.status === 'string' && allowedStatuses.has(req.body.status)
          ? (req.body.status as 'planned' | 'running' | 'passed' | 'failed')
          : undefined;
      const admin = (req as AuthedRequest).admin;
      const drill = await updateBackupDrill(
        req.params.id,
        {
          status,
          completedAt:
            typeof req.body?.completedAt === 'string' ? req.body.completedAt : undefined,
          rpoMinutes:
            req.body?.rpoMinutes === undefined ? undefined : Number(req.body.rpoMinutes),
          rtoMinutes:
            req.body?.rtoMinutes === undefined ? undefined : Number(req.body.rtoMinutes),
          verifiedTables:
            req.body?.verifiedTables === undefined ? undefined : Number(req.body.verifiedTables),
          verifiedRows:
            req.body?.verifiedRows === undefined ? undefined : Number(req.body.verifiedRows),
          checksum: typeof req.body?.checksum === 'string' ? req.body.checksum : undefined,
          notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
          details:
            req.body?.details && typeof req.body.details === 'object' ? req.body.details : undefined,
        },
        admin?.email || 'unknown-admin'
      );
      auditControlRequest(req, {
        action: 'control.backup_drill.update',
        targetType: 'backup_drill',
        targetId: drill.id,
        after: drill,
      });
      res.json(drill);
    } catch (err: any) {
      console.error('[control] backup drill update failed:', err);
      res.status(500).json({ error: err?.message || 'Backup drill update failed.' });
    }
  });

  app.get('/api/control/runbook-executions', async (_req, res) => {
    try {
      res.json(await loadRunbookExecutions());
    } catch (err: any) {
      console.error('[control] runbook execution read failed:', err);
      res.status(500).json({ error: err?.message || 'Runbook execution read failed.' });
    }
  });

  app.post('/api/control/runbooks/:id/execute', async (req, res) => {
    try {
      const changeRequestId = String(req.body?.changeRequestId || '').trim();
      if (!changeRequestId) {
        return res.status(400).json({ error: 'An approved change request id is required.' });
      }
      const admin = (req as AuthedRequest).admin;
      const execution = await startRunbookExecution(
        req.params.id,
        changeRequestId,
        admin?.email || 'unknown-admin'
      );
      auditControlRequest(req, {
        action: 'control.runbook.start',
        targetType: 'runbook',
        targetId: req.params.id,
        after: execution,
        approvalId: changeRequestId,
      });
      res.status(201).json(execution);
    } catch (err: any) {
      console.error('[control] runbook start failed:', err);
      res.status(400).json({ error: err?.message || 'Runbook execution failed.' });
    }
  });

  app.post('/api/control/runbook-executions/:id/step', async (req, res) => {
    try {
      const stepIndex = Number(req.body?.stepIndex);
      const result = String(req.body?.result || 'done');
      if (!Number.isInteger(stepIndex) || stepIndex < 0) {
        return res.status(400).json({ error: 'A zero-based step index is required.' });
      }
      if (!['done', 'failed', 'skipped'].includes(result)) {
        return res.status(400).json({ error: 'Step result must be done, failed or skipped.' });
      }
      const admin = (req as AuthedRequest).admin;
      const execution = await advanceRunbookExecution(
        req.params.id,
        {
          stepIndex,
          result: result as 'done' | 'failed' | 'skipped',
          note: typeof req.body?.note === 'string' ? req.body.note : undefined,
        },
        admin?.email || 'unknown-admin'
      );
      auditControlRequest(req, {
        action: 'control.runbook.step',
        targetType: 'runbook_execution',
        targetId: execution.id,
        after: { step: stepIndex + 1, result, note: req.body?.note || '' },
        approvalId: execution.changeRequestId,
      });
      res.json(execution);
    } catch (err: any) {
      console.error('[control] runbook step failed:', err);
      res.status(400).json({ error: err?.message || 'Runbook step failed.' });
    }
  });

  app.post('/api/control/runbook-executions/:id/abort', async (req, res) => {
    try {
      const status = String(req.body?.status || 'abandoned');
      if (status !== 'failed' && status !== 'abandoned') {
        return res.status(400).json({ error: 'Abort status must be failed or abandoned.' });
      }
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ error: 'An abort reason is required.' });
      const admin = (req as AuthedRequest).admin;
      const execution = await abortRunbookExecution(
        req.params.id,
        status,
        reason,
        admin?.email || 'unknown-admin'
      );
      auditControlRequest(req, {
        action: 'control.runbook.abort',
        targetType: 'runbook_execution',
        targetId: execution.id,
        after: { status, reason },
        approvalId: execution.changeRequestId,
      });
      res.json(execution);
    } catch (err: any) {
      console.error('[control] runbook abort failed:', err);
      res.status(400).json({ error: err?.message || 'Runbook abort failed.' });
    }
  });

  const getGeminiClient = (): GoogleGenAI | null => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // POST /api/advisor/analyze
  app.post('/api/advisor/analyze', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }
      const { summaryData } = req.body || {};
      if (!summaryData || typeof summaryData !== 'object') {
        return res.status(400).json({ error: 'summaryData object is required.' });
      }
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are a senior retail strategist for Zejesh, a quiet Nordic luxury fashion atelier.
Analyze this real studio data: ${JSON.stringify(summaryData)}.
Return a JSON array of strategic recommendations based strictly on the provided real data with fields: title, priority (high/medium/low), category, evidence, recommendation, expectedImpact, effort.
Strictly valid JSON only.`,
      });
      const text = response.text || '';
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return res.json({ insights: Array.isArray(parsed) ? parsed : [] });
    } catch (err: any) {
      console.error('Error running advisor analysis:', err);
      return res.status(500).json({ error: err?.message || 'Advisor analysis failed.' });
    }
  });

  // POST /api/advisor/chat
  app.post('/api/advisor/chat', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }
      const { contextSummary, userText } = req.body || {};
      if (typeof userText !== 'string' || !userText.trim()) {
        return res.status(400).json({ error: 'userText is required.' });
      }
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${String(contextSummary || '')}\nUser question: ${userText.trim()}\nProvide a concise strategic answer grounded strictly in these real numbers. If there is insufficient data to answer, state clearly that there is not enough data.`,
      });
      return res.json({
        text: response.text || 'The model returned no content. Please rephrase your question and ask again.',
      });
    } catch (err: any) {
      console.error('Error running advisor chat:', err);
      return res.status(500).json({ error: err?.message || 'Advisor chat failed.' });
    }
  });

  const operationsCache = new Map<
    string,
    {
      status: 'pending' | 'completed' | 'failed';
      videoUrl?: string;
      error?: string;
      aspectRatio?: string;
    }
  >();

  // POST /api/generate-video
  app.post(
    '/api/generate-video',
    rateLimit(UPLOAD_RATE_MAX, 'video-gen'),
    async (req, res) => {
      try {
        const ai = getGeminiClient();
        if (!ai) {
          return res.status(503).json({ error: 'Server misconfigured: missing GEMINI_API_KEY' });
        }

        const { imageBase64, prompt, aspectRatio = '16:9' } = req.body;

        if (!imageBase64) {
          return res.status(400).json({ error: 'Image data is required' });
        }

        if (!(await isFeatureEnabled('video_generation'))) {
          return res.status(503).json({
            error: 'Video generation is disabled by the video_generation feature flag.',
          });
        }

        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const imageMimeType = imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

        const enhancedPrompt = `${prompt || 'Cinematic haute couture fashion movement'}. Slow fluid motion, photorealistic fabric physics, high resolution, minimalist Scandinavian architectural studio background, dramatic studio lighting, 24fps.`;

        let operation: GenerateVideosOperation;

        try {
          operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-001',
            prompt: enhancedPrompt,
            image: {
              imageBytes: cleanBase64,
              mimeType: imageMimeType,
            },
            config: {
              aspectRatio: aspectRatio as '16:9' | '9:16',
              numberOfVideos: 1,
            },
          });
        } catch (apiErr: any) {
          console.warn('Veo 3.1 video generation request failed:', apiErr);
          return res.status(502).json({
            error: apiErr?.message || 'Video generation service unavailable.',
          });
        }

        if (!operation.name) {
          return res.status(500).json({ error: 'Failed to initialize video generation' });
        }

        operationsCache.set(operation.name, {
          status: 'pending',
          aspectRatio,
        });

        void createVideoJobRun(
          operation.name,
          aspectRatio,
          (req as InstrumentedRequest).requestId
        ).catch((jobErr) => console.error('[video] durable job create failed:', jobErr));

        res.json({
          operationName: operation.name,
          status: 'pending',
          message: 'Video generation initiated with Veo 3.1 Fast',
        });
      } catch (err: any) {
        console.error('Error starting video generation:', err);
        res.status(500).json({ error: err?.message || 'Video generation failed' });
      }
    }
  );

  // POST /api/video-status
  app.post('/api/video-status', async (req, res) => {
    try {
      const { operationName } = req.body;

      if (!operationName) {
        return res.status(400).json({ error: 'Operation name is required' });
      }

      const stored = await getVideoJobRun(operationName).catch(() => null);
      const storedVideoUrl =
        typeof stored?.details?.videoUrl === 'string' ? stored.details.videoUrl : null;
      if (stored?.status === 'completed' && storedVideoUrl) {
        return res.json({
          done: true,
          status: 'completed',
          videoUrl: storedVideoUrl,
          restored: true,
        });
      }
      if (stored?.status === 'failed' && stored.error) {
        return res.json({
          done: true,
          status: 'failed',
          error: stored.error,
          restored: true,
        });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({ error: 'Server misconfigured: missing GEMINI_API_KEY' });
      }

      let operation = new GenerateVideosOperation();
      operation.name = operationName;

      try {
        operation = await ai.operations.getVideosOperation({
          operation,
        });
      } catch (pollErr: any) {
        console.warn('Failed to poll video operation:', pollErr);
        return res.status(502).json({ error: 'Failed to poll video generation status' });
      }

      if (operation.done) {
        if (operation.error) {
          const error = String(operation.error.message || 'Video generation failed');
          operationsCache.set(operationName, {
            status: 'failed',
            error,
          });
          void updateVideoJobRun(operationName, { status: 'failed', error }).catch((jobErr) =>
            console.error('[video] durable job update failed:', jobErr)
          );

          return res.json({
            done: true,
            status: 'failed',
            error: operation.error.message,
          });
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;

        if (videoUri) {
          operationsCache.set(operationName, {
            status: 'completed',
            videoUrl: videoUri,
          });
          void updateVideoJobRun(operationName, {
            status: 'completed',
            videoUrl: videoUri,
          }).catch((jobErr) => console.error('[video] durable job update failed:', jobErr));

          return res.json({
            done: true,
            status: 'completed',
            videoUrl: videoUri,
          });
        }
      }

      res.json({
        done: false,
        status: 'pending',
      });
    } catch (err: any) {
      console.error('Error checking video status:', err);
      res.status(500).json({ error: err?.message || 'Failed to check status' });
    }
  });

  // POST /api/video-download
  app.post('/api/video-download', async (req, res) => {
    try {
      const { videoUri } = req.body;

      if (!videoUri) {
        return res.status(400).json({ error: 'Video URI is required' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Server misconfigured: missing GEMINI_API_KEY' });
      }

      let parsed: URL;
      try {
        parsed = new URL(videoUri);
      } catch {
        return res.status(400).json({ error: 'Invalid video URI' });
      }

      const allowedHosts = ['generativelanguage.googleapis.com'];
      if (!allowedHosts.includes(parsed.hostname)) {
        return res.status(400).json({ error: 'Invalid video host' });
      }

      const separator = videoUri.includes('?') ? '&' : '?';
      const authenticatedUri = `${videoUri}${separator}key=${process.env.GEMINI_API_KEY}`;

      const response = await fetch(authenticatedUri);

      if (!response.ok) {
        throw new Error(`Failed to fetch video from upstream (${response.status})`);
      }

      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="zejesh-couture-motion.mp4"');
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error('Error proxying video download:', err);
      res.status(500).json({ error: err?.message || 'Download failed' });
    }
  });

  // TARGETS SYSTEM API ROUTES
  app.get('/api/targets/active', async (req, res) => {
    try {
      const plan = await getActiveTargetPlan();
      res.json({ success: true, plan });
    } catch (err: any) {
      console.error('[Targets API] Error getting active plan:', err);
      res.status(500).json({ error: err?.message || 'Failed to get active plan' });
    }
  });

  app.post('/api/targets/save', async (req, res) => {
    try {
      const { plan } = req.body;
      if (!plan) return res.status(400).json({ error: 'Plan data required' });

      const planId = await saveTargetPlan(plan);
      res.json({ success: true, planId });
    } catch (err: any) {
      console.error('[Targets API] Error saving plan:', err);
      res.status(500).json({ error: err?.message || 'Failed to save plan' });
    }
  });

  app.post('/api/targets/lock', async (req, res) => {
    try {
      const { planId, periodType, periodKey } = req.body;
      if (!planId || !periodType || !periodKey) {
        return res.status(400).json({ error: 'Missing lock parameters' });
      }

      await lockPeriod(planId, periodType, periodKey);
      res.json({ success: true, message: `Period ${periodKey} locked` });
    } catch (err: any) {
      console.error('[Targets API] Error locking period:', err);
      res.status(500).json({ error: err?.message || 'Failed to lock period' });
    }
  });

  app.post('/api/targets/calculate', async (req, res) => {
    try {
      const { annualTarget, baselineRevenue, months = 12, startYear, startMonth } = req.body;

      if (!annualTarget || !baselineRevenue) {
        return res.status(400).json({ error: 'Annual target and baseline revenue required' });
      }

      const growthRate = calculateGrowthRate(baselineRevenue, annualTarget, months);
      const monthlyTargets = generateMonthlyTargets(
        annualTarget,
        growthRate,
        months,
        startYear || new Date().getFullYear(),
        startMonth || 1
      );

      res.json({
        success: true,
        calculation: {
          growthRate,
          monthlyTargets,
        },
      });
    } catch (err: any) {
      console.error('[Targets API] Error calculating targets:', err);
      res.status(500).json({ error: err?.message || 'Calculation failed' });
    }
  });

  app.post('/api/metrics/save', async (req, res) => {
    try {
      const { actual } = req.body;
      if (!actual) return res.status(400).json({ error: 'Actual metric data required' });

      await saveMetricActual(actual);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Targets API] Error saving metric:', err);
      res.status(500).json({ error: err?.message || 'Failed to save metric' });
    }
  });

  app.get('/api/metrics', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start and end date required' });
      }

      const actuals = await getMetricActuals(String(startDate), String(endDate));
      res.json({ success: true, actuals });
    } catch (err: any) {
      console.error('[Targets API] Error getting metrics:', err);
      res.status(500).json({ error: err?.message || 'Failed to get metrics' });
    }
  });

  app.post('/api/targets/progress', async (req, res) => {
    try {
      const { target, actual, periodStart, periodEnd, today } = req.body;
      const now = new Date().toISOString().split('T')[0];
      const progress = calculateProgress(
        target || 0,
        actual || 0,
        periodStart || now,
        periodEnd || now,
        today || now
      );
      res.json({ success: true, progress });
    } catch (err: any) {
      console.error('[Targets API] Error calculating progress:', err);
      res.status(500).json({ error: err?.message || 'Failed to calculate progress' });
    }
  });

  app.post('/api/targets/catchup', async (req, res) => {
    try {
      const { target, actual, remainingDays = 30 } = req.body;
      const catchUp = calculateCatchUp(target || 0, actual || 0, remainingDays);
      res.json({ success: true, catchUp });
    } catch (err: any) {
      console.error('[Targets API] Error calculating catch-up:', err);
      res.status(500).json({ error: err?.message || 'Failed to calculate catch-up' });
    }
  });

  app.post('/api/targets/probability', async (req, res) => {
    try {
      const { actual = 0, target = 1, daysElapsed = 1, daysRemaining = 30 } = req.body;
      const probability = calculateHitProbability(actual, target, daysElapsed, daysRemaining);
      res.json({ success: true, probability });
    } catch (err: any) {
      console.error('[Targets API] Error calculating probability:', err);
      res.status(500).json({ error: err?.message || 'Failed to calculate probability' });
    }
  });

  app.post('/api/targets/reverse-funnel', async (req, res) => {
    try {
      const { targetPieces = 100, conversionRate = 0.015, unitsPerOrder = 1.3, channelShares = [] } = req.body;
      const calculation = calculateReverseFunnel(targetPieces, conversionRate, unitsPerOrder, channelShares);
      res.json({ success: true, calculation });
    } catch (err: any) {
      console.error('[Targets API] Error calculating reverse funnel:', err);
      res.status(500).json({ error: err?.message || 'Failed to calculate reverse funnel' });
    }
  });

  app.post('/api/targets/save-reverse-funnel', async (req, res) => {
    try {
      const { calculation } = req.body;
      if (!calculation) return res.status(400).json({ error: 'Calculation data required' });

      await saveReverseFunnelCalculation(calculation);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Targets API] Error saving reverse funnel:', err);
      res.status(500).json({ error: err?.message || 'Failed to save reverse funnel' });
    }
  });

  app.get('/api/targets/reverse-funnel/latest', async (req, res) => {
    try {
      const calculation = await getLatestReverseFunnelCalculation();
      res.json({ success: true, calculation });
    } catch (err: any) {
      console.error('[Targets API] Error getting latest reverse funnel:', err);
      res.status(500).json({ error: err?.message || 'Failed to get reverse funnel' });
    }
  });

  app.post('/api/coach/tasks/save', async (req, res) => {
    try {
      const { task } = req.body;
      if (!task) return res.status(400).json({ error: 'Task data required' });

      await saveCoachTask(task);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Coach] Error saving task:', err);
      res.status(500).json({ error: err?.message || 'Failed to save task' });
    }
  });

  app.post('/api/coach/tasks/status', async (req, res) => {
    try {
      const { taskId, status } = req.body;
      if (!taskId || !status) return res.status(400).json({ error: 'Task ID and status required' });

      await updateCoachTaskStatus(taskId, status);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Coach] Error updating task status:', err);
      res.status(500).json({ error: err?.message || 'Failed to update task status' });
    }
  });

  app.get('/api/coach/tasks', async (req, res) => {
    try {
      const { date } = req.query;
      const targetDate = date ? String(date) : new Date().toISOString().split('T')[0];

      const tasks = await getCoachTasksForDate(targetDate);
      res.json({ success: true, tasks });
    } catch (err: any) {
      console.error('[Coach] Error getting tasks:', err);
      res.status(500).json({ error: err?.message || 'Failed to get tasks' });
    }
  });

  app.post('/api/coach/tasks/generate', async (req, res) => {
    try {
      const { date, gap, criticalMetrics, focusArea } = req.body;
      const targetDate = date || new Date().toISOString().split('T')[0];

      const tasks = generateDailyCoachTasks(targetDate, gap || 0, criticalMetrics || [], focusArea);

      for (const task of tasks) {
        await saveCoachTask(task);
      }

      res.json({ success: true, tasks });
    } catch (err: any) {
      console.error('[Coach] Error generating tasks:', err);
      res.status(500).json({ error: err?.message || 'Failed to generate tasks' });
    }
  });

  app.post('/api/coach/brief/save', async (req, res) => {
    try {
      const { brief } = req.body;
      if (!brief) return res.status(400).json({ error: 'Brief data required' });

      await saveDailyCoachBrief(brief);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Coach] Error saving brief:', err);
      res.status(500).json({ error: err?.message || 'Failed to save brief' });
    }
  });

  app.get('/api/coach/brief', async (req, res) => {
    try {
      const { date } = req.query;
      const targetDate = date ? String(date) : new Date().toISOString().split('T')[0];

      const brief = await getDailyCoachBrief(targetDate);
      res.json({ success: true, brief });
    } catch (err: any) {
      console.error('[Coach] Error getting brief:', err);
      res.status(500).json({ error: err?.message || 'Failed to get brief' });
    }
  });

  app.post('/api/coach/brief/generate', async (req, res) => {
    try {
      const { date, targetPlan, actuals, tasks } = req.body;
      const targetDate = date || new Date().toISOString().split('T')[0];

      const brief = generateDailyCoachBrief(
        targetDate,
        targetPlan || null,
        actuals || [],
        tasks || []
      );

      await saveDailyCoachBrief(brief);

      res.json({ success: true, brief });
    } catch (err: any) {
      console.error('[Coach] Error generating brief:', err);
      res.status(500).json({ error: err?.message || 'Failed to generate daily coach brief' });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  const isProd = process.env.NODE_ENV !== 'development';

  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status: number =
        err?.type === 'entity.too.large'
          ? 413
          : err?.type === 'entity.parse.failed' || err?.status === 400
          ? 400
          : typeof err?.status === 'number'
          ? err.status
          : typeof err?.statusCode === 'number'
          ? err.statusCode
          : 500;

      if (status >= 500) {
        console.error(`[${req.method} ${req.originalUrl}]`, err);
      }

      if (res.headersSent) return;

      const message =
        status === 413
          ? 'Request body too large.'
          : status === 400
          ? 'Malformed JSON body.'
          : status >= 500
          ? 'Internal server error.'
          : err?.message || 'Request failed.';

      res.status(status).json({
        error: message,
        ...(isProd ? {} : { stack: err?.stack }),
      });
    }
  );

  return app;
}

export const app = createExpressApp();
export default app;
