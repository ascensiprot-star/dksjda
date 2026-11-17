import React, { useState, useEffect, useMemo } from 'react';
import { CommunitySuggestion } from '../types';
import {
  subscribeToSuggestions,
  submitCommunitySuggestion,
  voteForSuggestion,
} from '../supabase/dbService';
import { isSupabaseConfigured } from '../supabase/config';
import { atelierSuggestions } from '../catalog';
import { editorialAt } from '../editorial';
import { CinematicHero } from './CinematicHero';
import {
  ArrowRight,
  Plus,
  X,
  Check,
  CheckCircle2,
  Clock,
  Scissors,
} from 'lucide-react';

interface CommunityVotePageProps {
  onBackToHome: () => void;
  onNavigateArchive: () => void;
}

export const CommunityVotePage: React.FC<CommunityVotePageProps> = ({
  onBackToHome,
  onNavigateArchive,
}) => {
  const [suggestions, setSuggestions] = useState<CommunitySuggestion[]>(
    isSupabaseConfigured ? [] : atelierSuggestions
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [activeFilter, setActiveFilter] = useState<'top' | 'all' | 'commissioned'>('top');
  const [votedIds, setVotedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('zejesh_user_voted_sug_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Proposal submission modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Outerwear');
  const [desiredFabric, setDesiredFabric] = useState('');
  const [description, setDescription] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Real-time subscription to suggestions via Supabase
  useEffect(() => {
    const unsub = subscribeToSuggestions((data) => {
      if (data && data.length > 0) setSuggestions(data);
      else if (!isSupabaseConfigured) setSuggestions(atelierSuggestions);
      setLoading(false);
    });
    if (!isSupabaseConfigured) setLoading(false);
    return () => unsub();
  }, []);

  const handleVote = async (id: string) => {
    if (votedIds.includes(id)) return;

    const newVoted = [...votedIds, id];
    setVotedIds(newVoted);
    try {
      localStorage.setItem('zejesh_user_voted_sug_ids', JSON.stringify(newVoted));
    } catch {}

    // Optimistic UI update
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, votes: s.votes + 1 } : s))
    );

    // Commit to Supabase when a live ledger is connected. Otherwise the
    // ballot remains a local, persisted vote.
    if (!isSupabaseConfigured) return;
    const voterId = `user-${Date.now().toString(36)}`;
    try {
      await voteForSuggestion(id, voterId);
    } catch (err) {
      console.warn('Vote could not be committed to the live ledger:', err);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setSubmitError('Please provide a garment title and description.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    if (!isSupabaseConfigured) {
      const entry: CommunitySuggestion = {
        id: `ballot-${Date.now().toString(36)}`,
        title: title.trim(),
        category: category.trim() || 'Outerwear',
        desiredFabric: desiredFabric.trim() || 'Natural virgin wool or cotton',
        description: description.trim(),
        submittedBy: submitterName.trim() || 'Atelier Patron',
        submitterEmail: submitterEmail.trim() || undefined,
        votes: 0,
        status: 'under_review',
        createdAt: new Date().toISOString(),
      };
      setSuggestions((prev) => [entry, ...prev]);
      setActiveFilter('all');
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setTitle('');
      setDesiredFabric('');
      setDescription('');
      setSubmitterName('');
      setSubmitterEmail('');
      setTimeout(() => {
        setSubmitSuccess(false);
        setIsModalOpen(false);
      }, 2000);
      return;
    }

    const res = await submitCommunitySuggestion({
      title: title.trim(),
      category: category.trim(),
      desiredFabric: desiredFabric.trim() || 'Natural Virgin Wool or Cotton',
      description: description.trim(),
      submittedBy: submitterName.trim() || 'Atelier Patron',
      submitterEmail: submitterEmail.trim() || undefined,
      status: 'under_review',
    });

    setIsSubmitting(false);

    if (res.success) {
      setSubmitSuccess(true);
      setTitle('');
      setDesiredFabric('');
      setDescription('');
      setSubmitterName('');
      setSubmitterEmail('');
      setTimeout(() => {
        setSubmitSuccess(false);
        setIsModalOpen(false);
      }, 2000);
    } else {
      setSubmitError(res.error || 'Failed to submit proposal.');
    }
  };

  const filteredSuggestions = useMemo(() => {
    let list = [...suggestions];
    if (activeFilter === 'top') {
      list.sort((a, b) => b.votes - a.votes);
    } else if (activeFilter === 'commissioned') {
      list = list.filter((s) => s.status === 'commissioned' || s.status === 'in_sampling');
      list.sort((a, b) => b.votes - a.votes);
    }
    return list;
  }, [suggestions, activeFilter]);

  const totalVotesCast = useMemo(
    () => suggestions.reduce((sum, s) => sum + (s.votes || 0), 0),
    [suggestions]
  );
  const commissionedCount = useMemo(
    () => suggestions.filter((s) => s.status === 'commissioned' || s.status === 'in_sampling').length,
    [suggestions]
  );

  const proposalImage = (category: string, idx: number) => {
    switch (category) {
      case 'Outerwear':
        return editorialAt(4);
      case 'Knitwear':
        return editorialAt(1);
      case 'Accessories':
        return editorialAt(3);
      case 'Tailoring':
        return editorialAt(0);
      case 'Footwear':
        return editorialAt(5);
      default:
        return editorialAt(idx % 7);
    }
  };

  return (
    <div className="w-full min-h-screen select-none bg-paper text-ink">
      <CinematicHero
        image={editorialAt(4)}
        imageAlt="Zejesh open ballot"
        eyebrow="Patron commissions · Open to the floor"
        title={
          <>
            What Should Zejesh Craft <em className="italic">Next</em>?
          </>
        }
        description="Vote on patron garment concepts or submit an architectural proposal. The strongest enter pattern drafting in Helsinki and shuttle-loom weaving in Porto."
        topLabel="Co-Creation Archive · Ballot 026"
        backAction={onBackToHome}
        primaryAction={{
          label: 'Propose a garment',
          onClick: () => setIsModalOpen(true),
          icon: 'plus',
        }}
        imageCaption="Ballot 026 · The open commission"
        titleClassName="text-[clamp(46px,6.2vw,116px)]"
        imagePosition="center 24%"
      />

      {/* Metrics band */}
      <section className="bg-ink text-paper">
        <div className="page-shell py-10 md:py-12">
          <div className="grid grid-cols-1 gap-5 min-[380px]:grid-cols-3 sm:gap-10">
            <div>
              <span className="label block text-[8px] text-white/35">Registered proposals</span>
              <span className="mt-3 block font-display text-[clamp(38px,5vw,64px)] leading-none">
                {suggestions.length}
              </span>
            </div>
            <div>
              <span className="label block text-[8px] text-white/35">Ballots cast</span>
              <span className="mt-3 block font-display text-[clamp(38px,5vw,64px)] leading-none">
                {totalVotesCast}
              </span>
            </div>
            <div>
              <span className="label block text-[8px] text-white/35">In production</span>
              <span className="mt-3 block font-display text-[clamp(38px,5vw,64px)] leading-none">
                {commissionedCount}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Premise */}
      <section className="page-shell py-20 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="min-w-0 lg:col-span-3">
            <span className="label block text-[9px] text-ink/35">01 / The ballot</span>
            <p className="mt-7 max-w-full break-words body-copy text-ink/45 lg:max-w-[26ch]">
              A public commission ledger, opened to patrons rather than seasonal forecasters.
            </p>
          </div>

          <div className="min-w-0 lg:col-span-9">
            <p className="max-w-full break-words font-display text-[clamp(32px,5.6vw,88px)] font-light leading-[0.94] tracking-[-0.035em] lg:max-w-[18ch]">
              A garment begins as a sentence. The ballot decides which sentences enter the{' '}
              <em className="italic">archive</em>.
            </p>

            <div className="mt-16 grid items-end gap-10 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <p className="max-w-[38ch] body-copy text-ink/55">
                  Every proposal is reviewed by the atelier. The most convincing silhouettes move
                  from public vote into pattern drafting, sampling and a numbered accession.
                </p>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="group mt-9 flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50 cursor-pointer"
                >
                  Submit a proposal
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>

              <div className="sm:col-span-7">
                <div className="relative aspect-[2/3] overflow-hidden bg-[#111]">
                  <img
                    src={editorialAt(5)}
                    alt="Zejesh pattern study"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-[center_20%] grayscale contrast-[1.08]"
                  />
                  <span className="absolute bottom-4 left-4 label text-[8px] text-white/70 mix-blend-difference">
                    Plate 01 · Pattern study, Helsinki
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="page-shell py-10 md:py-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-1 sm:gap-x-10">
            {(['top', 'all', 'commissioned'] as const).map((filterKey) => (
              <button
                key={filterKey}
                type="button"
                onClick={() => setActiveFilter(filterKey)}
                className={`flex min-h-[44px] items-center label transition-colors cursor-pointer ${
                  activeFilter === filterKey ? 'text-ink' : 'text-ink-a45 hover:text-ink'
                }`}
              >
                {filterKey === 'top' && 'Most Voted'}
                {filterKey === 'all' && 'All Proposals'}
                {filterKey === 'commissioned' && 'Commissioned & In Sampling'}
              </button>
            ))}
          </div>
          <span className="label text-ink-a45">
            Showing {filteredSuggestions.length} registered proposals
          </span>
        </div>
      </div>

      {/* Ballot ledger */}
      <div className="page-shell pb-24 md:pb-36">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <aside className="min-w-0 space-y-10 lg:col-span-3 lg:sticky lg:top-[calc(var(--nav-h)+24px)] lg:self-start">
            <div>
              <span className="label block text-[9px] text-ink/35">The proposals</span>
              <p className="mt-5 max-w-[12ch] font-display text-[clamp(30px,3vw,46px)] font-light leading-[1.02] tracking-[-0.03em]">
                Open to the floor. Ordered by <em className="italic">conviction</em>.
              </p>
            </div>
            <div className="space-y-5">
              {[
                ['01', 'Submit a silhouette'],
                ['02', 'The house reviews the pattern'],
                ['03', 'The strongest enter drafting'],
              ].map(([index, label]) => (
                <div key={index} className="flex gap-4">
                  <span className="font-mono text-[9px] tracking-[0.18em] text-ink/25">{index}</span>
                  <span className="max-w-[22ch] body-copy text-ink/45">{label}</span>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 lg:col-span-9">
            {loading ? (
              <div className="py-24 text-center label text-ink-a45">
                Consulting atelier ballot archive...
              </div>
            ) : filteredSuggestions.length === 0 ? (
              <div className="py-24 text-center space-y-6">
                <p className="body-copy text-ink-a45 mx-auto">No proposals match this filter.</p>
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className="inline-flex min-h-[44px] items-center label text-ink cursor-pointer hover:opacity-55"
                >
                  View all proposals →
                </button>
              </div>
            ) : (
              <div className="space-y-16 md:space-y-24">
                {filteredSuggestions.map((item, idx) => {
                  const hasVoted = votedIds.includes(item.id);
                  const isCommissioned = item.status === 'commissioned';
                  const isInSampling = item.status === 'in_sampling';

                  return (
                    <article key={item.id} className="grid gap-7 lg:grid-cols-12 lg:gap-10">
                      <div className="relative aspect-[2/3] overflow-hidden bg-[#111] lg:col-span-4">
                        <img
                          src={proposalImage(item.category, idx)}
                          alt={item.title}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover object-[center_20%] grayscale contrast-[1.08]"
                        />
                        <span className="absolute left-4 top-4 label text-[8px] text-white/75 mix-blend-difference">
                          № {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <span className="absolute bottom-4 left-4 label text-[8px] text-white/60 mix-blend-difference">
                          {item.category}
                        </span>
                      </div>

                      <div className="flex flex-col lg:col-span-8">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <span className="label flex items-center gap-1.5 text-ink-a45">
                            {isCommissioned ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.2]" />
                                <span className="text-ink">Commissioned</span>
                              </>
                            ) : isInSampling ? (
                              <>
                                <Scissors className="w-3.5 h-3.5 stroke-[1.2]" />
                                <span className="text-ink">Pattern Drafting</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5 stroke-[1.2]" />
                                <span>Ballot Review</span>
                              </>
                            )}
                          </span>
                          <span className="label text-ink-a45 text-left lg:text-right leading-relaxed">
                            <span className="block">By {item.submittedBy || 'Atelier Patron'}</span>
                            <span className="block mt-1">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                          </span>
                        </div>

                        <h3 className="mt-6 max-w-[14ch] font-display text-[clamp(34px,4.4vw,64px)] font-light leading-[0.9] tracking-[-0.035em]">
                          {item.title}
                        </h3>

                        <div className="mt-5 font-mono text-[10px] tracking-[0.16em] text-ink-a45 flex flex-wrap items-start gap-2">
                          <span className="uppercase shrink-0">Fabrication</span>
                          <span className="text-ink">{item.desiredFabric}</span>
                        </div>

                        <p className="mt-6 max-w-[50ch] body-copy text-ink-a72">{item.description}</p>

                        {item.curatorNotes && (
                          <p className="mt-5 max-w-[46ch] body-copy italic text-ink-a45">
                            Atelier dispatch — {item.curatorNotes}
                          </p>
                        )}

                        <div className="mt-auto flex items-end justify-between gap-6 pt-10">
                          <div>
                            <span className="label block text-ink-a45">Current support</span>
                            <span className="mt-2 block font-display text-[clamp(44px,5vw,64px)] leading-none">
                              {item.votes}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleVote(item.id)}
                            disabled={hasVoted}
                            className={`group inline-flex min-h-[44px] items-center gap-3 label transition-opacity cursor-pointer ${
                              hasVoted
                                ? 'text-ink-a45 cursor-default'
                                : 'text-ink hover:opacity-55'
                            }`}
                            aria-label={hasVoted ? 'Ballot recorded' : `Cast ballot for ${item.title}`}
                          >
                            {hasVoted ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Ballot recorded</span>
                              </>
                            ) : (
                              <>
                                <span>Cast ballot</span>
                                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Closing interlude */}
      <section
        data-dark-section
        className="relative overflow-hidden bg-black py-28 text-white md:py-44"
      >
        <img
          src={editorialAt(3)}
          alt="Zejesh open commission"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[center_26%] opacity-40 grayscale contrast-[1.15]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-black/90"
        />
        <div className="relative z-10 page-shell">
          <div className="mx-auto max-w-[68rem] text-center">
            <span className="label text-[9px] text-white/45">Open commission · Nº 026</span>
            <blockquote className="mt-8 font-display text-[clamp(38px,6.4vw,104px)] font-light leading-[0.94] tracking-[-0.04em]">
              The next plate begins as a <em className="italic">suggestion</em>.
            </blockquote>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="group mt-10 inline-flex min-h-[44px] items-center gap-3 label text-[9px] text-white/55 transition-colors hover:text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Propose a garment
            </button>
          </div>
        </div>
      </section>

      {/* Proposal modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-paper text-ink">
          <div className="grid min-h-[100dvh] lg:grid-cols-2">
            <aside className="relative hidden overflow-hidden bg-black lg:block">
              <img
                src={editorialAt(6)}
                alt="Zejesh atelier commission"
                className="absolute inset-0 h-full w-full object-cover object-[center_24%] grayscale contrast-[1.1]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30"
              />
              <div className="relative z-10 flex h-full flex-col justify-between p-10 text-white xl:p-14">
                <span className="label text-[9px] text-white/50">Atelier commission · Nº 026</span>
                <div>
                  <p className="max-w-[12ch] font-display text-[clamp(40px,4.6vw,72px)] font-light leading-[0.9] tracking-[-0.04em]">
                    A garment begins as a <em className="italic">sentence</em>.
                  </p>
                  <span className="mt-8 block label text-[8px] text-white/40">
                    Helsinki · Porto · Est. 2026
                  </span>
                </div>
              </div>
            </aside>

            <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
              <div className="mx-auto w-full max-w-[620px]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="label text-ink-a45 block">Open ballot</span>
                    <h2 className="mt-4 font-display text-[clamp(34px,4.4vw,52px)] font-light leading-none">
                      Propose a <em className="italic">Garment</em>
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 -mr-2 text-ink-a45 hover:text-ink cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" strokeWidth={1.2} />
                  </button>
                </div>

                <p className="mt-4 body-copy text-ink-a72">
                  Describe the garment you wish to see crafted by Zejesh. Proposals with high
                  community support enter pattern drafting.
                </p>

                {submitSuccess ? (
                  <div className="py-16 text-center space-y-4">
                    <CheckCircle2 className="w-8 h-8 mx-auto stroke-[1] text-ink" />
                    <h3 className="font-display text-[30px] leading-none text-ink">
                      Proposal <em className="italic">Registered</em>
                    </h3>
                    <p className="body-copy text-ink-a72 max-w-sm mx-auto">
                      Your piece has been added to the public ballot. Fellow patrons can now vote for
                      its creation.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitProposal} className="mt-8 space-y-6">
                    {submitError && <div className="label text-ink">{submitError}</div>}

                    <div>
                      <label htmlFor="proposal-title" className="field-label">
                        Garment Title / Concept *
                      </label>
                      <input
                        id="proposal-title"
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Double-Breasted Heavy Wool Greatcoat"
                        className="field"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="proposal-category" className="field-label">
                          Category
                        </label>
                        <select
                          id="proposal-category"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="field"
                        >
                          <option value="Outerwear">Outerwear</option>
                          <option value="Knitwear">Knitwear</option>
                          <option value="Tailoring">Tailoring</option>
                          <option value="Accessories">Accessories</option>
                          <option value="Footwear">Footwear</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="proposal-fabric" className="field-label">
                          Desired Fabrication
                        </label>
                        <input
                          id="proposal-fabric"
                          type="text"
                          value={desiredFabric}
                          onChange={(e) => setDesiredFabric(e.target.value)}
                          placeholder="e.g. 100% Virgin Wool (700 gsm)"
                          className="field"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="proposal-description" className="field-label">
                        Silhouette & Construction Details *
                      </label>
                      <textarea
                        id="proposal-description"
                        required
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe the stance, collar, pockets, closure, length, and why this piece belongs in the permanent archive..."
                        className="field resize-y"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="proposal-name" className="field-label">
                          Your Name / Handle
                        </label>
                        <input
                          id="proposal-name"
                          type="text"
                          value={submitterName}
                          onChange={(e) => setSubmitterName(e.target.value)}
                          placeholder="e.g. Marcus / Collector"
                          className="field"
                        />
                      </div>

                      <div>
                        <label htmlFor="proposal-email" className="field-label">
                          Email (optional notification)
                        </label>
                        <input
                          id="proposal-email"
                          type="email"
                          value={submitterEmail}
                          onChange={(e) => setSubmitterEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="field"
                        />
                      </div>
                    </div>

                    <div className="flex items-end justify-end gap-8 pt-3">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="inline-flex min-h-[44px] items-center label text-ink-a45 hover:text-ink cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="btn btn-primary btn-lg disabled:opacity-40"
                      >
                        <span>{isSubmitting ? 'Registering...' : 'Submit to Ballot'}</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
