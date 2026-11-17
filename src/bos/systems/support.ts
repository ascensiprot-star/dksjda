import type { BosAction } from '../core/system';
import { db, optionalRows, asRecord } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { stringField, optionalString, enumField, pagination, emailField } from '../core/validation';

const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
const TICKET_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;

interface TicketRow {
  id: string;
  customer_email: string;
  order_id?: string | null;
  subject: string;
  status: string;
  priority: string;
  assigned_to?: string | null;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string | null;
}

export const supportActions: Record<string, BosAction> = {
  tickets: {
    permission: 'support.read',
    description: 'List support tickets.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 30);
      let query = db.from('support_tickets').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<TicketRow>(query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('support_tickets').select('*', { count: 'exact', head: true })),
      ]);
      return { tickets: rows, total, limit, offset };
    },
  },

  ticketGet: {
    permission: 'support.read',
    description: 'Ticket detail with messages and linked order.',
    handler: async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const ticket = await db.required<TicketRow>(
        db.from('support_tickets').select('*').eq('id', id).maybeSingle(),
        'Ticket not found.'
      );
      const [messages, order] = await Promise.all([
        optionalRows<any>(db.from('ticket_messages').select('*').eq('ticket_id', id).order('created_at')),
        ticket.order_id
          ? db.one(db.from('orders').select('id, number, status, totals').eq('id', ticket.order_id).maybeSingle())
          : Promise.resolve(null),
      ]);
      return { ticket, messages, order };
    },
  },

  ticketCreate: {
    permission: 'support.write',
    description: 'Open a support ticket.',
    handler: async (ctx, input) => {
      const email = emailField(input);
      const subject = stringField(input, 'subject', { required: true, max: 200 });
      const body = stringField(input, 'body', { required: true, max: 8000 });
      const orderId = optionalString(input, 'orderId', 120);
      const priority = enumField(input, 'priority', TICKET_PRIORITIES, { fallback: 'normal' });
      if (orderId) {
        const order = await db.one<{ customer?: unknown }>(
          db.from('orders').select('customer').eq('id', orderId).maybeSingle()
        );
        if (!order) throw badRequest('Linked order not found.');
        const orderEmail = String(asRecord(order.customer).email || '').toLowerCase();
        if (orderEmail && orderEmail !== email) {
          throw conflict('The customer email does not match the linked order.');
        }
      }
      const id = bosId('tkt');
      const now = new Date().toISOString();
      await db.from('support_tickets').insert({
        id,
        customer_email: email,
        order_id: orderId || null,
        subject,
        status: 'open',
        priority,
        created_at: now,
        updated_at: now,
        last_message_at: now,
      });
      await db.from('ticket_messages').insert({
        id: bosId('tkm'),
        ticket_id: id,
        author_type: 'customer',
        author_email: email,
        body,
        created_at: now,
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'support.ticket.create',
        targetType: 'ticket',
        targetId: id,
        after: { email, subject, priority, orderId },
        requestId: ctx.requestId,
      });
      return { id, email, subject, priority };
    },
  },

  ticketReply: {
    permission: 'support.write',
    description: 'Append an operator reply.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const body = stringField(input, 'body', { required: true, max: 8000 });
      const ticket = await db.required<TicketRow>(
        db.from('support_tickets').select('*').eq('id', id).maybeSingle(),
        'Ticket not found.'
      );
      if (ticket.status === 'closed') throw conflict('Reopen the ticket before replying.');
      const now = new Date().toISOString();
      await db.from('ticket_messages').insert({
        id: bosId('tkm'),
        ticket_id: id,
        author_type: 'admin',
        author_email: ctx.actor.email,
        body,
        created_at: now,
      });
      await db
        .from('support_tickets')
        .update({ status: 'pending', updated_at: now, last_message_at: now, assigned_to: ctx.actor.email })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'support.ticket.reply',
        targetType: 'ticket',
        targetId: id,
        after: { body: body.slice(0, 200) },
        requestId: ctx.requestId,
      });
      return { id, status: 'pending' };
    },
  },

  ticketStatus: {
    permission: 'support.write',
    description: 'Move a ticket through its lifecycle.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const status = enumField(input, 'status', TICKET_STATUSES);
      const ticket = await db.required<TicketRow>(
        db.from('support_tickets').select('*').eq('id', id).maybeSingle(),
        'Ticket not found.'
      );
      await db
        .from('support_tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'support.ticket.status',
        targetType: 'ticket',
        targetId: id,
        before: { status: ticket.status },
        after: { status },
        requestId: ctx.requestId,
      });
      return { id, status };
    },
  },

  ticketStats: {
    permission: 'support.read',
    description: 'Recorded support volume and response state.',
    handler: async () => {
      const rows = await db.rows<TicketRow>(db.from('support_tickets').select('*').limit(50000));
      const byStatus = new Map<string, number>();
      const byPriority = new Map<string, number>();
      for (const row of rows) {
        byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
        byPriority.set(row.priority, (byPriority.get(row.priority) || 0) + 1);
      }
      return {
        total: rows.length,
        open: byStatus.get('open') || 0,
        pending: byStatus.get('pending') || 0,
        byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
        byPriority: Array.from(byPriority.entries()).map(([priority, count]) => ({ priority, count })),
      };
    },
  },
};
