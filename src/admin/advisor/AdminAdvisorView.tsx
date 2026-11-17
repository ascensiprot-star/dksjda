import React, { useState } from 'react';
import { Product, DailyStat, AiInsight } from '../../types';
import { useAuth } from '../../supabase/AuthContext';
import { supabase } from '../../supabase/config';
import { logAuditEvent } from '../../supabase/dbService';
import {
 Sparkles,
 ArrowRight,
 CheckCircle,
 MessageSquare,
 Clock,
 TrendingUp,
 AlertCircle,
 Send,
 RefreshCw,
 ExternalLink,
} from 'lucide-react';

interface AdminAdvisorViewProps {
 products: Product[];
 dailyStats: DailyStat[];
 insights: AiInsight[];
 onRefresh: () => void;
 onNavigateView: (view: string) => void;
}

export const AdminAdvisorView: React.FC<AdminAdvisorViewProps> = ({
 products,
 dailyStats,
 insights,
 onRefresh,
 onNavigateView,
}) => {
 const { isEditor, adminProfile } = useAuth();
 const [activeTab, setActiveTab] = useState<'insights' | 'chat' | 'digest'>('insights');
 const [isAnalyzing, setIsAnalyzing] = useState(false);
 const [chatQuery, setChatQuery] = useState('');
 const totalRev = dailyStats.reduce((s, d) => s + (d.revenue || 0), 0);
 const totalOrd = dailyStats.reduce((s, d) => s + (d.orders || 0), 0);

 const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; citations?: string }>>(() => [
 {
 sender: 'ai',
 text: totalOrd > 0
 ? `Welcome. I have reviewed your live studio telemetry across your ${products.length} catalog items. You have generated ${totalRev.toLocaleString()} € in sales across ${totalOrd} completed orders. How may I advise your retail strategy today?`
 : `Welcome. I am connected to your live store database. You currently have ${products.length} catalog garments and 0 settled orders. How may I assist in merchandising, price architecture, or catalog launch preparation?`,
 },
 ]);
 const [isAsking, setIsAsking] = useState(false);

 const activeInsightsList = insights || [];

 const handleMarkInsightDone = async (insightId: string) => {
 if (!isEditor) return;
 try {
 await supabase
 .from('insights')
 .update({
 status: 'done',
 resolvedAt: new Date().toISOString(),
 })
 .eq('id', insightId);
 await logAuditEvent(adminProfile?.name || 'admin', 'mark_insight_done', insightId);
 onRefresh();
 } catch {
 // Update failed — reload the current database state instead of guessing.
 onRefresh();
 }
 };

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch {
      // Unauthenticated requests are rejected by the server.
    }
    return headers;
  };

  const handleAnalyzeNow = async () => {
    if (products.length === 0 && dailyStats.length === 0) {
      alert('There is not enough data in the database to generate strategic insights. Please add products and record store traffic first.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const summaryData = {
        productsCount: products.length,
        totalSalesVolume: dailyStats.reduce((a, s) => a + (s.revenue || 0), 0),
        ordersCount: dailyStats.reduce((a, s) => a + (s.orders || 0), 0),
        topSelling: products.slice(0, 3).map((p) => p.nr || p.name?.en),
        lowStock: products.filter((p) => p.stock < 4).map((p) => p.nr || p.name?.en),
      };

      const res = await fetch('/api/advisor/analyze', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ summaryData }),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = Array.isArray(data?.insights) ? data.insights : [];
        for (const item of parsed) {
          const id = `ins-ai-${Date.now()}-${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
          await supabase.from('insights').upsert({
            ...item,
            id,
            status: 'new',
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('AI Advisor analysis note:', err);
    } finally {
      setIsAnalyzing(false);
      onRefresh();
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || isAsking) return;

    const userText = chatQuery.trim();
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatQuery('');

    if (products.length === 0 && dailyStats.length === 0) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'There is not enough data recorded in the database to answer this question. Please publish products and generate sales traffic first.',
        },
      ]);
      return;
    }

    setIsAsking(true);

    try {
      const totalSales = dailyStats.reduce((a, s) => a + (s.revenue || 0), 0);
      const totalOrders = dailyStats.reduce((a, s) => a + (s.orders || 0), 0);
      const contextSummary = `Studio context: ${products.length} catalog items. Total recorded revenue: ${totalSales} €. Total orders: ${totalOrders}.`;

      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ contextSummary, userText }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: data?.text || 'The model returned no content. Please rephrase your question and ask again.',
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: `Studio records show ${products.length} products and ${totalOrders} orders (${totalSales} € recorded revenue). Connect GEMINI_API_KEY on the server for conversational strategic intelligence.`,
          },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Could not complete analysis at this time. Please verify network connectivity.',
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

 return (
 <div className="space-y-8 text-[13px]">
 {/* Title & Actions */}
 <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-4">
 <div>
 <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">AI Studio Advisor</h1>
 <p className="text-small text-paper-a45 mt-0.5">
 Strategic analysis grounded in your recorded catalog, order and traffic data. When there is not
 enough data, the advisor says so instead of guessing.
 </p>
 </div>

 <button
 onClick={handleAnalyzeNow}
 disabled={isAnalyzing}
 className="btn btn-secondary !min-h-[40px] !px-5 disabled:opacity-50"
 >
 <Sparkles className="w-3.5 h-3.5" />
 <span>{isAnalyzing ? 'Analyzing Studio Data...' : 'Run Intelligence Sweep'}</span>
 </button>
 </div>

 {/* Tabs */}
 <div className="flex micro-sm border-b border-paper-a18">
 {[
 { id: 'insights', label: `1. Actionable Insights (${activeInsightsList.filter((i) => i.status !== 'done').length})` },
 { id: 'chat', label: '2. Ask Your Data (Chat)' },
 { id: 'digest', label: '3. Weekly Executive Digest' },
 ].map((tab) => (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id as any)}
 className={`px-4 py-3 transition-colors cursor-pointer border-b-2 -mb-px ${ activeTab === tab.id ? 'text-paper border-paper' : 'text-paper-a45 border-transparent hover:text-paper'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 {/* TAB 1: ACTIONABLE INSIGHTS */}
 {activeTab === 'insights' && (
 <div className="space-y-4">
 <div className="grid grid-cols-1 gap-4">
 {activeInsightsList.length === 0 ? (
 <div className="p-8 text-center space-y-2">
 <span className="text-small uppercase font-normal text-paper tracking-wider block">
 No Strategic Insights Yet
 </span>
 <p className="text-small text-paper-a72 max-w-md mx-auto">
 {products.length === 0
 ? 'No products found in the catalog. Add products and record store traffic to enable strategic intelligence analysis.'
 : 'Click "Analyze Catalog & Traffic" above to generate strategic recommendations from live store telemetry.'}
 </p>
 </div>
 ) : (
 activeInsightsList.map((ins) => (
 <div
 key={ins.id}
 className={`p-5 border border-paper-a18 space-y-3 transition-colors ${ ins.status ==='done' ? 'opacity-50' : ''
 }`}
 >
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5">
 <div className="flex items-center gap-2.5">
 <span
 className={`text-small uppercase font-normal tracking-wider ${ ins.priority ==='high' ? 'underline' : 'text-paper-a72'
 }`}
 >
 [{ins.priority} priority]
 </span>
 <span className="text-small uppercase text-paper-a45 tracking-wider">
 · {ins.category}
 </span>
 </div>

 <span className="text-small text-paper-a45">
 Status: <span className="font-normal uppercase">{ins.status}</span>
 </span>
 </div>

 <div>
 <h3 className="font-display text-[22px] font-light text-paper leading-tight">{ins.title}</h3>
 <div className="text-small text-paper-a72 mt-1 leading-relaxed">
 <span className="font-normal text-paper">Evidence: </span>
 {ins.evidence}
 </div>
 <div className="text-small text-paper-a72 mt-1 leading-relaxed">
 <span className="font-normal text-paper">Recommendation: </span>
 {ins.recommendation}
 </div>
 </div>

 <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-small">
 <div className="space-x-4 text-paper-a72">
 <span>
 Expected Impact: <span className="font-normal text-paper">{ins.expectedImpact}</span>
 </span>
 <span>·</span>
 <span>
 Effort: <span className="text-paper">{ins.effort}</span>
 </span>
 </div>

 <div className="flex items-center gap-4">
 {ins.suggestedAction?.deepLink && (
 <button
 onClick={() => onNavigateView(ins.suggestedAction.deepLink!)}
 className="text-small uppercase text-paper hover:opacity-60 underline underline-offset-4 cursor-pointer flex items-center gap-1 font-normal"
 >
 <span>Open in Admin</span>
 <ArrowRight className="w-3 h-3" />
 </button>
 )}

 {ins.status !== 'done' && (
 <button
 onClick={() => handleMarkInsightDone(ins.id)}
 className="text-small uppercase text-paper-a72 hover:text-paper underline underline-offset-4 cursor-pointer"
 >
 Mark Done
 </button>
 )}
 </div>
 </div>
 </div>
 )))}
 </div>
 </div>
 )}

 {/* TAB 2: ASK YOUR DATA (Interactive Natural Language Querying) */}
 {activeTab === 'chat' && (
 <div className="border border-paper-a18 p-6 space-y-5 max-w-3xl">
 <div>
 <h2 className="font-display text-[24px] font-light text-paper normal-case tracking-normal">
 Ask Your Data (Studio Intelligence)
 </h2>
 <p className="text-small text-paper-a45 mt-0.5">
 Ask strategic questions in English or Finnish. The model answers from your recorded store totals;
 when the data is missing it states that there is not enough data.
 </p>
 </div>

 {/* Chat Transcript */}
 <div className="h-80 overflow-y-auto p-4 space-y-4 border border-paper-a18 bg-ink">
 {chatMessages.map((msg, idx) => (
 <div
 key={idx}
 className={`p-3 max-w-[85%] text-[13px] leading-relaxed ${ msg.sender ==='user'
 ? 'ml-auto bg-paper text-ink'
 : 'mr-auto border border-paper-a18 text-paper'
 }`}
 >
 <div className="micro-sm text-paper-a45 mb-1.5">
 {msg.sender === 'user' ? 'Store Strategist' : 'Zejesh AI Engine'}
 </div>
 <div>{msg.text}</div>
 </div>
 ))}
 {isAsking && (
 <div className="p-3 bg-ink mr-auto text-small text-paper-a45">
 Calculating studio telemetry...
 </div>
 )}
 </div>

 {/* Input Form */}
 <form onSubmit={handleSendChat} className="flex gap-3">
 <input
 type="text"
 value={chatQuery}
 onChange={(e) => setChatQuery(e.target.value)}
 placeholder="e.g. Which category converts best on mobile? Or what pieces should I launch next?"
 className="flex-1 px-3 py-2 text-small bg-transparent"
 />
 <button
 type="submit"
 disabled={isAsking || !chatQuery.trim()}
 className="text-small uppercase tracking-wider text-paper hover:opacity-60 underline underline-offset-4 cursor-pointer font-normal disabled:opacity-30"
 >
 Ask Advisor
 </button>
 </form>
 </div>
 )}

 {/* TAB 3: WEEKLY EXECUTIVE DIGEST (no fabricated report is generated) */}
 {activeTab === 'digest' && (
 <div className="border border-paper-a18 p-6 space-y-5 max-w-2xl">
 <div>
 <div className="text-small uppercase text-paper-a45 tracking-wider">Executive Briefing</div>
 <h2 className="font-display text-[30px] font-light text-paper mt-1.5">Weekly Executive Digest</h2>
 </div>

 <div className="p-8 text-center space-y-2">
 <span className="text-small uppercase font-normal text-paper tracking-wider block">No data yet</span>
 <p className="text-small text-paper-a72 max-w-md mx-auto leading-relaxed">
 Not enough data yet — the advisor needs live store activity before it can write a digest.
 Revenue, order and traffic figures will appear here once they are recorded in the database.
 </p>
 <p className="text-small text-paper-a45">
 Recorded so far: {products.length} catalog items · {totalOrd} orders · {totalRev.toLocaleString()} €
 </p>
 </div>
 </div>
 )}
 </div>
 );
};
