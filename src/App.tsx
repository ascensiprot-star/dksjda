import React, { useState, useEffect, useRef } from 'react';
import { Product, CartItem, Language, PageRoute } from './types';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { HomeSections } from './components/HomeSections';
import { ProductListing } from './components/ProductListing';
import { ProductDetail } from './components/ProductDetail';
import { QuickLookModal } from './components/QuickLookModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { WishlistDrawer } from './components/WishlistDrawer';
import { SearchModal } from './components/SearchModal';
import { MobileMenu } from './components/MobileMenu';
import { JournalModal } from './components/JournalModal';
import { JournalPage } from './components/JournalPage';
import { CookieBanner } from './components/CookieBanner';
import { StaticPages } from './components/StaticPages';
import { Footer } from './components/Footer';
import { StoryPage } from './components/StoryPage';
import { CommunityVotePage } from './components/CommunityVotePage';
import { LookbookView } from './components/LookbookView';
import { AuthProvider, useAuth, DESIGNATED_ADMIN_EMAIL } from './supabase/AuthContext';
import { StorefrontDataProvider, useStorefrontData } from './context/StorefrontDataContext';
import { AdminLayout } from './admin/AdminLayout';
import { AdminRestrictedGate } from './admin/security/AdminRestrictedGate';
import { AuthPage } from './components/AuthPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { forceUnlockBodyScroll } from './utils/scrollLock';
import { Preloader } from './components/Preloader';

export const ADMIN_SECRET_PATH = '/admin';
export const ADMIN_SECRET_HASH = '#admin';
export const ADMIN_LONG_VAULT_PATH = '/atelier-security-vault-huxaifa-official-jm942jd-enterprise-management-terminal-8492048102-restricted-console';

function isSecretAdminUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  return (
    path === '/admin' ||
    path === '/admin/' ||
    hash === '#admin' ||
    path === '/admin-console' ||
    hash === '#admin-console' ||
    path === '/terminal' ||
    hash === '#terminal' ||
    path === ADMIN_LONG_VAULT_PATH ||
    path === `${ADMIN_LONG_VAULT_PATH}/` ||
    hash === `#${ADMIN_LONG_VAULT_PATH}` ||
    path.startsWith(ADMIN_LONG_VAULT_PATH)
  );
}

function parseCurrentUrlToRoute(): PageRoute {
  if (typeof window === 'undefined') return { type: 'home' };
  if (isSecretAdminUrl()) return { type: 'admin' };

  const pathname = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase().replace(/^#/, '');
  const raw = hash || pathname.replace(/^\//, '');

  if (!raw || raw === '') return { type: 'home' };
  if (raw === 'story') return { type: 'story' };
  if (raw === 'suggest' || raw === 'vote') return { type: 'vote' };
  if (raw === 'lookbook') return { type: 'lookbook' };
  if (raw === 'journal') return { type: 'journal' };
  if (raw.startsWith('journal/')) {
    return { type: 'journal', articleSlug: raw.replace('journal/', '') };
  }
  if (raw === 'sitemap') return { type: 'sitemap' };
  if (raw === 'gift-cards') return { type: 'gift-cards' };
  if (raw === 'archive') return { type: 'archive' };
  if (raw.startsWith('archive/')) {
    const parts = raw.replace('archive/', '').split('/');
    return { type: 'archive', category: parts[0], subcategory: parts[1] };
  }
  if (raw.startsWith('category/')) {
    const cat = raw.replace('category/', '');
    return { type: 'archive', category: cat };
  }
  if (raw.startsWith('product/')) {
    return { type: 'product', productId: raw.replace('product/', '') };
  }
  if (raw.startsWith('about/')) {
    const s = raw.replace('about/', '');
    if (s === 'philosophy' || s === 'materials' || s === 'sustainability' || s === 'workshops') {
      return { type: 'about', slug: s };
    }
    return { type: 'about', slug: 'philosophy' };
  }
  if (raw.startsWith('service/')) {
    const s = raw.replace('service/', '');
    if (s === 'contact' || s === 'shipping-returns' || s === 'tracking' || s === 'size-guide') {
      return { type: 'service', slug: s };
    }
    return { type: 'service', slug: 'contact' };
  }
  if (raw.startsWith('legal/')) {
    const s = raw.replace('legal/', '');
    if (s === 'terms' || s === 'privacy' || s === 'cookies') {
      return { type: 'legal', slug: s };
    }
    return { type: 'legal', slug: 'terms' };
  }
  if (raw === 'cart') return { type: 'cart' };
  if (raw === 'checkout') return { type: 'checkout' };
  if (raw === 'wishlist') return { type: 'wishlist' };
  if (raw === 'account' || raw === 'auth' || raw === 'login' || raw === 'signin') return { type: 'auth', mode: 'signin' };
  if (raw === 'signup' || raw === 'register') return { type: 'auth', mode: 'signup' };
  if (raw === 'forgot' || raw === 'forgot-password' || raw === 'recover') return { type: 'auth', mode: 'forgot' };
  if (raw === 'admin-console' || raw === 'terminal') return { type: 'admin' };

  return { type: 'home' };
}

function getRouteUrl(r: PageRoute): string {
  switch (r.type) {
    case 'home': return '/';
    case 'story': return '/story';
    case 'vote': return '/suggest';
    case 'lookbook': return '/lookbook';
    case 'archive':
      return r.category ? (r.subcategory ? `/archive/${r.category}/${r.subcategory}` : `/archive/${r.category}`) : '/archive';
    case 'product': return `/product/${r.productId}`;
    case 'journal': return r.articleSlug ? `/journal/${r.articleSlug}` : '/journal';
    case 'sitemap': return '/sitemap';
    case 'gift-cards': return '/gift-cards';
    case 'about': return `/about/${r.slug}`;
    case 'service': return `/service/${r.slug}`;
    case 'legal': return `/legal/${r.slug}`;
    case 'cart': return '/cart';
    case 'checkout': return '/checkout';
    case 'wishlist': return '/wishlist';
    case 'account': return '/auth';
    case 'auth':
      return r.mode === 'signup' ? '/signup' : r.mode === 'forgot' ? '/forgot' : '/auth';
    case 'admin': return ADMIN_SECRET_PATH;
    default: return '/';
  }
}

function StorefrontApp() {
  const { products, categories, collections, content, loading: productsLoading, isLiveFromFirestore } = useStorefrontData();
  const { user, isAdmin, isOwner, loading: authLoading } = useAuth();
  const [preloaderDone, setPreloaderDone] = useState(false);

  // Check if current authenticated user is the designated admin (huxaifa0fficial@gmail.com)
  const isDesignatedAdminLoggedIn = Boolean(
    user && (
      (user.email && user.email.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL.toLowerCase()) ||
      isAdmin ||
      isOwner
    )
  );

  // Pure English language (all other languages removed)
  const [language, setLanguage] = useState<Language>('en');

  // Multi-Page Route State (Supporting 50+ distinct page routes & long secret admin console)
  const [route, setRoute] = useState<PageRoute>(() => parseCurrentUrlToRoute());

  // Overlays and Modals State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(route.type === 'cart');
  const [isWishlistOpen, setIsWishlistOpen] = useState(route.type === 'wishlist');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(route.type === 'checkout');
  const [quickLookProduct, setQuickLookProduct] = useState<Product | null>(null);
  const [journalArticleId, setJournalArticleId] = useState<string | null>(null);

  // A direct /journal/:slug link opens the same full-screen reader as a click
  // inside the journal index.
  useEffect(() => {
    if (route.type === 'journal' && route.articleSlug) {
      const article = (content?.journalPosts || []).find(
        (post) => post.slug === route.articleSlug || post.id === route.articleSlug
      );
      setJournalArticleId(article?.id || null);
    } else if (route.type !== 'journal') {
      setJournalArticleId(null);
    }
  }, [route, content?.journalPosts]);

  // Cart & Wishlist State - Start empty (no seeded data)
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [isHeroVisible, setIsHeroVisible] = useState(true);

  const homeSectionRef = useRef<HTMLDivElement | null>(null);

  // Browser History & Hash integration
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      forceUnlockBodyScroll();
      if (e.state && e.state.route) {
        setRoute(e.state.route);
      } else {
        setRoute(parseCurrentUrlToRoute());
      }
    };

    const handleHashChange = () => {
      forceUnlockBodyScroll();
      setRoute(parseCurrentUrlToRoute());
    };

    const checkDirectAdminAttempt = () => {
      const p = window.location.pathname;
      const h = window.location.hash;
      if (p === '/admin' || p === '/admin/' || h === '#admin') {
        window.history.replaceState(null, '', '/');
      }
    };
    checkDirectAdminAttempt();

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navigateTo = (newRoute: PageRoute, addToHistory = true) => {
    forceUnlockBodyScroll();
    setRoute(newRoute);
    setIsMobileMenuOpen(false);

    if (newRoute.type === 'cart') setIsCartOpen(true);
    if (newRoute.type === 'checkout') setIsCheckoutOpen(true);
    if (newRoute.type === 'wishlist') setIsWishlistOpen(true);

    if (addToHistory && typeof window !== 'undefined') {
      const url = getRouteUrl(newRoute);
      window.history.pushState({ route: newRoute }, '', url);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // The opening frame belongs to the films. The navigation stays hidden
  // until the visitor begins to scroll.
  useEffect(() => {
    const handleScroll = () => {
      // The same opening-frame rule applies to the house's cinematic pages.
      const openingFrameRoutes: PageRoute['type'][] = [
        'home',
        'story',
        'journal',
        'lookbook',
        'vote',
      ];
      if (openingFrameRoutes.includes(route.type)) {
        setIsHeroVisible(window.scrollY < 24);
      } else {
        setIsHeroVisible(false);
      }
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [route.type]);

  // Navigation Handlers
  const handleNavigateHome = () => {
    navigateTo({ type: 'home' });
  };

  const handleSelectCategory = (category: string, subcategory?: string) => {
    navigateTo({ type: 'archive', category, subcategory });
  };

  const handleSelectProduct = (product: Product) => {
    navigateTo({ type: 'product', productId: product.id });
  };

  const handleScrollCue = () => {
    if (homeSectionRef.current) {
      homeSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
    }
  };

  // Cart Operations
  const handleAddToCart = (product: Product, size: string) => {
    setCartItems((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.size === size
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.size === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, size, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const handleQuickAdd = (product: Product, size: string) => {
    handleAddToCart(product, size);
  };

  const handleUpdateQuantity = (productId: string, size: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId && item.size === size) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveFromCart = (productId: string, size: string) => {
    setCartItems((prev) =>
      prev.filter(
        (item) => !(item.product.id === productId && item.size === size)
      )
    );
  };

  // Wishlist Operations
  const handleToggleWishlist = (productId: string) => {
    setWishlistIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  // Resolve current active product if route is 'product' from live products
  const activeProduct =
    route.type === 'product'
      ? products.find((p) => p.id === route.productId) || products[0] || null
      : null;

  // Enforce Administrator Access: link only opens if signed in with huxaifa0fficial@gmail.com
  if (route.type === 'admin') {
    if (authLoading) {
      return (
        <div className="admin-scope admin-auth-page">
          <div className="admin-auth-bar">
            <span className="label">ZEJESH // TERMINAL GATE</span>
            <span className="label">SEC-00</span>
          </div>
          <div className="admin-auth-main">
            <span className="label text-[#ffa21f]">VERIFYING OPERATOR SESSION…</span>
          </div>
        </div>
      );
    }

    if (!user) {
      return (
        <ErrorBoundary componentName="AdminAuthView">
          <AuthPage
            adminIntent
            initialMode="signin"
            onNavigateHome={handleNavigateHome}
            onNavigateAdmin={() => navigateTo({ type: 'admin' })}
            onOpenCart={() => setIsCartOpen(true)}
            onOpenWishlist={() => setIsWishlistOpen(true)}
          />
        </ErrorBoundary>
      );
    }

    if (!isDesignatedAdminLoggedIn) {
      return (
        <AdminRestrictedGate
          onGoToAuth={() => navigateTo({ type: 'admin' })}
          onBackToStorefront={() => {
            if (window.location.hash.includes('admin') || window.location.pathname.includes('admin')) {
              window.history.pushState(null, '', '/');
            }
            navigateTo({ type: 'home' });
          }}
        />
      );
    }

    return (
      <AdminLayout
        onBackToStorefront={() => {
          window.history.pushState(null, '', '/');
          navigateTo({ type: 'home' });
        }}
        onViewProductInStore={(p) => navigateTo({ type: 'product', productId: p.id })}
      />
    );
  }

  // Dedicated Auth & Patron Portal View (Standalone, without storefront category header & footer)
  if (route.type === 'auth') {
    return (
      <ErrorBoundary componentName="AuthView">
        <AuthPage
          initialMode={route.mode ? route.mode : 'signin'}
          onNavigateHome={handleNavigateHome}
          onNavigateAdmin={() => navigateTo({ type: 'admin' })}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenWishlist={() => setIsWishlistOpen(true)}
          onNavigateArchive={() => navigateTo({ type: 'archive' })}
          cartCount={totalCartCount}
          wishlistCount={wishlistIds.length}
        />
        <CartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          items={cartItems}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveFromCart}
          onProceedToCheckout={() => setIsCheckoutOpen(true)}
          onExploreArchive={() => navigateTo({ type: 'archive' })}
          language={language}
        />
        <WishlistDrawer
          isOpen={isWishlistOpen}
          onClose={() => setIsWishlistOpen(false)}
          wishlistIds={wishlistIds}
          onRemoveWishlist={handleToggleWishlist}
          onSelectProduct={handleSelectProduct}
          onQuickAdd={handleQuickAdd}
          language={language}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="storefront relative min-h-screen bg-paper text-ink selection:bg-ink selection:text-paper">
      {!preloaderDone && <Preloader onComplete={() => setPreloaderDone(true)} />}
      {/* 1. FIXED HEADER — arrives after the opening frame */}
      <ErrorBoundary componentName="Header">
        <Header
          language={language}
          onSetLanguage={(lang) => setLanguage(lang)}
          cartCount={totalCartCount}
          wishlistCount={wishlistIds.length}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenWishlist={() => setIsWishlistOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenAccount={() => navigateTo({ type: 'auth', mode: 'signin' })}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onSelectCategory={handleSelectCategory}
          onNavigateHome={handleNavigateHome}
          onNavigateLookbook={() => navigateTo({ type: 'lookbook' })}
          onNavigateSitemap={() => navigateTo({ type: 'sitemap' })}
          onNavigateStory={() => navigateTo({ type: 'story' })}
          onNavigateVote={() => navigateTo({ type: 'vote' })}
          isHeroVisible={isHeroVisible}
          currentCategory={route.type === 'archive' ? (route.category || 'all') : undefined}
          currentRouteType={route.type}
          categories={categories}
        />
      </ErrorBoundary>

      {/* 4. MULTI-PAGE VIEW ROUTER (50+ Pages) */}
      <main>
        {/* PAGE: HOME */}
        {route.type === 'home' && (
          <ErrorBoundary componentName="HomeView">
            {/* Multi-Slide Hero: Video + Studio Photo on pure white background */}
            <HeroSection
              onScrollCueClick={handleScrollCue}
              language={language}
              slides={content?.heroSlides && content.heroSlides.length > 0 ? content.heroSlides : undefined}
            />

            {/* The house reel: two films, the edit, and the services */}
            <div ref={homeSectionRef}>
              <HomeSections
                language={language}
                onSelectProduct={handleSelectProduct}
                onSelectCategory={handleSelectCategory}
                onOpenQuickLook={(prod) => setQuickLookProduct(prod)}
                onQuickAdd={handleQuickAdd}
                onToggleWishlist={handleToggleWishlist}
                wishlistIds={wishlistIds}
                products={products}
                onNavigateStory={() => navigateTo({ type: 'story' })}
                onNavigateLookbook={() => navigateTo({ type: 'lookbook' })}
              />
            </div>
          </ErrorBoundary>
        )}

        {/* PAGE: THE ARCHIVE & CATEGORIES (All Category & Subcategory Pages, or as backdrop for overlay routes) */}
        {(route.type === 'archive' ||
          route.type === 'cart' ||
          route.type === 'checkout' ||
          route.type === 'wishlist') && (
          <ErrorBoundary componentName="ArchiveView">
            <ProductListing
              language={language}
              selectedCategory={route.type === 'archive' ? (route.category || 'all') : 'all'}
              selectedSubcategory={route.type === 'archive' ? route.subcategory : undefined}
              onSelectCategory={handleSelectCategory}
              onSelectProduct={handleSelectProduct}
              onOpenQuickLook={(prod) => setQuickLookProduct(prod)}
              onQuickAdd={handleQuickAdd}
              onToggleWishlist={handleToggleWishlist}
              wishlistIds={wishlistIds}
              products={products}
              categories={categories}
              loading={productsLoading}
              isLiveFromFirestore={isLiveFromFirestore}
            />
          </ErrorBoundary>
        )}

        {/* PAGE: DEDICATED INDIVIDUAL PRODUCT PAGE (24 distinct pages) */}
        {route.type === 'product' && (
          <ErrorBoundary componentName="ProductDetailView">
            {activeProduct ? (
              <ProductDetail
                product={activeProduct}
                language={language}
                onBackToArchive={() => navigateTo({ type: 'archive', category: activeProduct.category })}
                onAddToCart={handleAddToCart}
                onSelectProduct={handleSelectProduct}
                onToggleWishlist={handleToggleWishlist}
                isWishlisted={wishlistIds.includes(activeProduct.id)}
              />
            ) : (
              <div className="page-shell flex min-h-[60vh] flex-col items-center justify-center gap-6 bg-paper py-32 text-center text-ink">
                <h1 className="font-display text-[clamp(40px,6vw,72px)] font-light">
                  Product <em className="italic">not found</em>
                </h1>
                <button
                  type="button"
                  onClick={() => navigateTo({ type: 'archive' })}
                  className="btn-text"
                >
                  Return to the archive <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </ErrorBoundary>
        )}

        {/* PAGE: LOOKBOOK */}
        {route.type === 'lookbook' && (
          <ErrorBoundary componentName="LookbookView">
            <LookbookView
              products={products}
              language={language}
              onBackToHome={handleNavigateHome}
              onSelectProduct={handleSelectProduct}
            />
          </ErrorBoundary>
        )}

        {/* PAGES: DEDICATED STATIC & EDITORIAL PAGES (Gift Cards, Sitemap, About, Service, Legal) */}
        {(route.type === 'gift-cards' ||
          route.type === 'sitemap' ||
          route.type === 'about' ||
          route.type === 'service' ||
          route.type === 'legal') && (
          <ErrorBoundary componentName="StaticPageView">
            <StaticPages
              slug={
                route.type === 'about'
                  ? route.slug
                  : route.type === 'service'
                  ? route.slug
                  : route.type === 'legal'
                  ? route.slug
                  : route.type
              }
              pageType={route.type}
              language={language}
              onNavigate={(r) => navigateTo(r)}
              onSelectProduct={handleSelectProduct}
            />
          </ErrorBoundary>
        )}

        {/* PAGE: STORY */}
        {route.type === 'story' && (
          <ErrorBoundary componentName="StoryView">
            <StoryPage
              onBackToHome={handleNavigateHome}
              onExploreArchive={() => navigateTo({ type: 'archive' })}
            />
          </ErrorBoundary>
        )}

        {/* PAGE: COMMUNITY VOTE / SUGGESTIONS */}
        {route.type === 'vote' && (
          <ErrorBoundary componentName="CommunityVoteView">
            <CommunityVotePage
              onBackToHome={handleNavigateHome}
              onNavigateArchive={() => navigateTo({ type: 'archive' })}
            />
          </ErrorBoundary>
        )}

        {/* PAGE: JOURNAL */}
        {route.type === 'journal' && (
          <ErrorBoundary componentName="JournalView">
            <JournalPage
              language={language}
              onBackToHome={handleNavigateHome}
              onSelectArticle={(id) => setJournalArticleId(id)}
              onExploreArchive={() => navigateTo({ type: 'archive' })}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* 5. LARGE FOOTER with 1-Click Translation & 50+ Page Directory */}
      <ErrorBoundary componentName="Footer">
        <Footer
          language={language}
          onSetLanguage={(lang) => setLanguage(lang)}
          onSelectCategory={handleSelectCategory}
          onNavigatePage={(r) => navigateTo(r)}
          dark={route.type === 'home'}
        />
      </ErrorBoundary>

      {/* 6. MODALS & DRAWERS */}
      <ErrorBoundary componentName="SearchModal">
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          language={language}
          onSelectProduct={handleSelectProduct}
        />
      </ErrorBoundary>

      <ErrorBoundary componentName="MobileMenu">
        <MobileMenu
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          language={language}
          onSetLanguage={(lang) => setLanguage(lang)}
          onSelectCategory={handleSelectCategory}
          onNavigateHome={handleNavigateHome}
          onNavigateLookbook={() => navigateTo({ type: 'lookbook' })}
          onNavigateSitemap={() => navigateTo({ type: 'sitemap' })}
          onNavigateStory={() => navigateTo({ type: 'story' })}
          onNavigateVote={() => navigateTo({ type: 'vote' })}
          onNavigateJournal={() => navigateTo({ type: 'journal' })}
          onNavigateAccount={() => navigateTo({ type: 'auth', mode: 'signin' })}
          categories={categories}
        />
      </ErrorBoundary>

      <ErrorBoundary componentName="CartDrawer">
        <CartDrawer
          isOpen={isCartOpen}
          onClose={() => {
            setIsCartOpen(false);
            if (route.type === 'cart') navigateTo({ type: 'home' });
          }}
          items={cartItems}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveFromCart}
          onProceedToCheckout={() => setIsCheckoutOpen(true)}
          onExploreArchive={() => navigateTo({ type: 'archive' })}
          language={language}
        />
      </ErrorBoundary>

      <ErrorBoundary componentName="CheckoutModal">
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => {
            setIsCheckoutOpen(false);
            if (route.type === 'checkout') navigateTo({ type: 'home' });
          }}
          items={cartItems}
          onOrderSuccess={() => setCartItems([])}
          language={language}
        />
      </ErrorBoundary>

      <ErrorBoundary componentName="WishlistDrawer">
        <WishlistDrawer
          isOpen={isWishlistOpen}
          onClose={() => {
            setIsWishlistOpen(false);
            if (route.type === 'wishlist') navigateTo({ type: 'home' });
          }}
          wishlistIds={wishlistIds}
          onRemoveWishlist={handleToggleWishlist}
          onSelectProduct={handleSelectProduct}
          onQuickAdd={handleQuickAdd}
          language={language}
        />
      </ErrorBoundary>

      <ErrorBoundary componentName="QuickLookModal">
        <QuickLookModal
          product={quickLookProduct}
          onClose={() => setQuickLookProduct(null)}
          onSelectProduct={(p) => {
            setQuickLookProduct(null);
            handleSelectProduct(p);
          }}
          onQuickAdd={handleQuickAdd}
          language={language}
        />
      </ErrorBoundary>

      <ErrorBoundary componentName="JournalModal">
        <JournalModal
          articleId={journalArticleId}
          onClose={() => {
            setJournalArticleId(null);
            if (route.type === 'journal' && route.articleSlug) {
              navigateTo({ type: 'journal' });
            }
          }}
          language={language}
        />
      </ErrorBoundary>

      <CookieBanner language={language} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StorefrontDataProvider>
        <StorefrontApp />
      </StorefrontDataProvider>
    </AuthProvider>
  );
}

