import { action, defineSystem } from '../core/system';
import { db, intOrZero, asArray } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, notFound } from '../core/errors';
import { stringField, optionalString, enumField, pagination, emailField } from '../core/validation';

const SUGGESTION_STATUSES = ['under_review', 'in_sampling', 'commissioned', 'declined'] as const;

interface SuggestionRow {
  id: string;
  title: string;
  category: string;
  "desiredFabric"?: string | null;
  description: string;
  "submittedBy"?: string | null;
  "submitterEmail"?: string | null;
  votes: number;
  "votedUserIds"?: unknown;
  status: string;
  "createdAt"?: string | null;
  "updatedAt"?: string | null;
  "curatorNotes"?: string | null;
}

export const suggestionsSystem = defineSystem({
  id: 'suggestions',
  index: 13,
  name: 'Community Suggestions',
  screen: 'suggestions',
  description: 'Demand signals, moderation and production decisions.',
  actions: {
    list: action('customer.read', 'List community suggestions.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 40);
      const sort = optionalString(input, 'sort', 20) || 'votes';
      let query = db.from('suggestions').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<SuggestionRow>(
          query
            .order(sort === 'new' ? 'createdAt' : 'votes', { ascending: false })
            .range(offset, offset + limit - 1)
        ),
        db.count(db.from('suggestions').select('*', { count: 'exact', head: true })),
      ]);
      return { suggestions: rows, total, limit, offset };
    }),

    get: action('customer.read', 'Suggestion detail.', async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const suggestion = await db.required<SuggestionRow>(
        db.from('suggestions').select('*').eq('id', id).maybeSingle(),
        'Suggestion not found.'
      );
      return { suggestion };
    }),

    create: action('customer.write', 'Record a suggestion from the admin.', async (ctx, input) => {
      const title = stringField(input, 'title', { required: true, max: 160 });
      const category = stringField(input, 'category', { required: true, max: 80 });
      const description = stringField(input, 'description', { required: true, max: 4000 });
      const email = optionalString(input, 'submitterEmail', 254);
      const now = new Date().toISOString();
      const suggestion = await db.write<SuggestionRow>(
        db
          .from('suggestions')
          .insert({
            id: bosId('sug'),
            title,
            category,
            desiredFabric: optionalString(input, 'desiredFabric', 120) || '',
            description,
            submittedBy: optionalString(input, 'submittedBy', 120) || '',
            submitterEmail: email ? email.toLowerCase() : '',
            votes: 0,
            votedUserIds: [],
            status: 'under_review',
            createdAt: now,
            updatedAt: now,
            curatorNotes: '',
          })
          .select('*')
          .single()
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'suggestions.create',
        targetType: 'suggestion',
        targetId: suggestion?.id,
        after: { title, category },
        requestId: ctx.requestId,
      });
      return { suggestion };
    }),

    updateStatus: action('customer.write', 'Move a suggestion through the curation pipeline.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const status = enumField(input, 'status', SUGGESTION_STATUSES);
      const existing = await db.one<SuggestionRow>(
        db.from('suggestions').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw notFound('Suggestion not found.');
      await db
        .from('suggestions')
        .update({ status, updatedAt: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'suggestions.status',
        targetType: 'suggestion',
        targetId: id,
        before: { status: existing.status },
        after: { status },
        requestId: ctx.requestId,
      });
      return { id, status };
    }),

    notes: action('customer.write', 'Update curator notes.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const notes = stringField(input, 'notes', { required: true, max: 4000 });
      const existing = await db.one<SuggestionRow>(
        db.from('suggestions').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw notFound('Suggestion not found.');
      await db
        .from('suggestions')
        .update({ curatorNotes: notes, updatedAt: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'suggestions.notes',
        targetType: 'suggestion',
        targetId: id,
        before: { curatorNotes: existing.curatorNotes },
        after: { curatorNotes: notes },
        requestId: ctx.requestId,
      });
      return { id, notes };
    }),

    stats: action('customer.read', 'Recorded community demand by category and status.', async () => {
      const rows = await db.rows<SuggestionRow>(
        db.from('suggestions').select('*').limit(20000)
      );
      const byStatus = new Map<string, number>();
      const byCategory = new Map<string, { count: number; votes: number }>();
      const byFabric = new Map<string, number>();
      let votes = 0;
      for (const row of rows) {
        byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
        const category = byCategory.get(row.category) || { count: 0, votes: 0 };
        category.count += 1;
        category.votes += intOrZero(row.votes);
        byCategory.set(row.category, category);
        votes += intOrZero(row.votes);
        if (row.desiredFabric) {
          byFabric.set(row.desiredFabric, (byFabric.get(row.desiredFabric) || 0) + 1);
        }
      }
      return {
        total: rows.length,
        votes,
        byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
        byCategory: Array.from(byCategory.entries())
          .map(([category, value]) => ({ category, ...value }))
          .sort((a, b) => b.votes - a.votes),
        topFabrics: Array.from(byFabric.entries())
          .map(([fabric, count]) => ({ fabric, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      };
    }),

    removeVote: action('customer.write', 'Remove a recorded vote by voter id.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const voter = stringField(input, 'voterId', { required: true, max: 120 });
      const row = await db.one<SuggestionRow>(
        db.from('suggestions').select('*').eq('id', id).maybeSingle()
      );
      if (!row) throw notFound('Suggestion not found.');
      const voters = asArray(row.votedUserIds).map(String);
      if (!voters.includes(voter)) throw badRequest('This voter is not recorded for the suggestion.');
      const nextVoters = voters.filter((entry) => entry !== voter);
      await db
        .from('suggestions')
        .update({
          votedUserIds: nextVoters,
          votes: Math.max(0, intOrZero(row.votes) - 1),
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'suggestions.vote.remove',
        targetType: 'suggestion',
        targetId: id,
        after: { voterId: voter, votes: nextVoters.length },
        requestId: ctx.requestId,
      });
      return { id, votes: nextVoters.length };
    }),
  },
});
