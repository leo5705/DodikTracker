import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { RouterProvider, useRouter } from './context/RouterContext.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { HomeView } from './components/views/HomeView.tsx';
import { SearchView } from './components/views/SearchView.tsx';
import { LibraryView } from './components/views/LibraryView.tsx';
import { FeedView } from './components/views/FeedView.tsx';
import { FriendsView } from './components/views/FriendsView.tsx';
import { ListsView } from './components/views/ListsView.tsx';
import { RouletteView } from './components/views/RouletteView.tsx';
import { TierListsView } from './components/views/TierListsView.tsx';
import { StatisticsView } from './components/views/StatisticsView.tsx';
import { CalendarView } from './components/views/CalendarView.tsx';
import { AdminView } from './components/views/AdminView.tsx';
import { AchievementsView } from './components/views/AchievementsView.tsx';
import { MessagesView } from './components/views/MessagesView.tsx';
import { ProfileView } from './components/views/ProfileView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';
import { NotificationCenterView } from './components/views/NotificationCenterView.tsx';
import { MediaDetailView } from './components/views/MediaDetailView.tsx';
import { TierListDetailView } from './components/views/TierListDetailView.tsx';
import { ListDetailView } from './components/views/ListDetailView.tsx';
import { LibraryImportView } from './components/views/LibraryImportView.tsx';
import { LibraryExportView } from './components/views/LibraryExportView.tsx';
import { GameDetailView } from './components/views/GameDetailView.tsx';
import { GameCatalogView } from './components/views/GameCatalogView.tsx';
import { GameDevelopersView } from './components/views/GameDevelopersView.tsx';
import { GameDeveloperDetailView } from './components/views/GameDeveloperDetailView.tsx';
import { GamePublishersView } from './components/views/GamePublishersView.tsx';
import { GamePublisherDetailView } from './components/views/GamePublisherDetailView.tsx';
import { GameSeriesDetailView } from './components/views/GameSeriesDetailView.tsx';
import { NewsView } from './components/views/NewsView.tsx';
import { NewsDetailView } from './components/views/NewsDetailView.tsx';
import { MusicStudioView } from './components/views/MusicStudioView.tsx';
import { MusicReleaseEditorView } from './components/views/MusicReleaseEditorView.tsx';
import { ArtistProfileView } from './components/views/ArtistProfileView.tsx';
import { MusicReleaseView } from './components/views/MusicReleaseView.tsx';
import { MusicHomeView } from './components/views/MusicHomeView.tsx';
import { MusicReleasesView } from './components/views/MusicReleasesView.tsx';
import { MusicNewReleasesView } from './components/views/MusicNewReleasesView.tsx';
import { MusicArtistsView } from './components/views/MusicArtistsView.tsx';
import { MusicGenresView } from './components/views/MusicGenresView.tsx';
import { MusicSearchView } from './components/views/MusicSearchView.tsx';
import { MusicLibraryView } from './components/views/MusicLibraryView.tsx';
import { MusicPlayerProvider } from './context/MusicPlayerContext.tsx';
import { AuthGatekeeper } from './components/auth/AuthGatekeeper.tsx';
import { ResetPasswordView } from './components/auth/ResetPasswordView.tsx';
import { MiniMessenger } from './components/modals/MiniMessenger.tsx';
import { AnnouncementBanner } from './components/AnnouncementBanner.tsx';
import { FeedbackModal } from './components/modals/FeedbackModal.tsx';
import { ShareProvider } from './context/ShareContext.tsx';
import { AppShell } from './components/design-system/index.ts';
import { Loader2 } from 'lucide-react';

function MainApp() {
  const { dbUser, loading } = useAuth();
  const { route, navigate } = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Handle category change from Navigation
  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    navigate(`/library?category=${cat}`);
  };

  // If initial auth is resolving, show sleek spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080A18] flex flex-col items-center justify-center text-[#94A3B8] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B5CF6]" />
        <span className="text-xs font-semibold tracking-wide font-mono">Загрузка Dodik Tracker...</span>
      </div>
    );
  }

  // Allow reset password page even without logged in user
  if (route.name === 'reset-password') {
    return <ResetPasswordView token={route.params.token} />;
  }

  // Gatekeeper: Closed project requirement - no access without registration/login
  if (!dbUser) {
    return <AuthGatekeeper />;
  }

  // Render view based on route
  const renderView = () => {
    switch (route.name) {
      case 'game-catalog':
        return <GameCatalogView />;

      case 'game-detail':
        return <GameDetailView key={route.params.id} idOrSlug={route.params.id} />;

      case 'game-developers':
        return <GameDevelopersView />;

      case 'game-developer-detail':
        return <GameDeveloperDetailView key={route.params.id} developerIdOrSlug={route.params.id} />;

      case 'game-publishers':
        return <GamePublishersView />;

      case 'game-publisher-detail':
        return <GamePublisherDetailView key={route.params.id} publisherIdOrSlug={route.params.id} />;

      case 'game-series-detail':
        return <GameSeriesDetailView key={route.params.id} seriesIdOrSlug={route.params.id} />;

      case 'media-detail':
        return (
          <MediaDetailView
            key={`${route.params.type || 'media'}-${route.params.id}`}
            mediaId={isNaN(parseInt(route.params.id, 10)) ? (route.params.id as any) : parseInt(route.params.id, 10)}
            mediaType={route.params.type}
            queryParams={route.params}
          />
        );

      case 'tier-list-detail':
        return <TierListDetailView tierListId={parseInt(route.params.id, 10)} />;

      case 'list-detail':
        return <ListDetailView listId={parseInt(route.params.id, 10)} />;

      case 'profile':
        return (
          <ProfileView
            username={route.params.username}
            onNavigateSettings={() => navigate('/settings')}
            onNavigateUser={(username) => navigate(`/u/${username}`)}
          />
        );

      case 'search':
        return <SearchView />;

      case 'library-import':
        return <LibraryImportView onBack={() => navigate('/library')} />;

      case 'library-export':
        return <LibraryExportView onBack={() => navigate('/library')} />;

      case 'library':
        return (
          <LibraryView
            selectedCategory={route.params?.category || selectedCategory}
            onSelectCategory={setSelectedCategory}
            onNavigateSearch={() => navigate('/search')}
          />
        );

      case 'feed':
        return <FeedView />;

      case 'friends':
        return <FriendsView />;

      case 'messages':
        return <MessagesView />;

      case 'lists':
        return <ListsView />;

      case 'roulette':
        return <RouletteView />;

      case 'tier-lists':
        return <TierListsView />;

      case 'statistics':
        return <StatisticsView />;

      case 'calendar':
        return <CalendarView />;

      case 'admin':
        return <AdminView />;

      case 'achievements':
        return <AchievementsView />;

      case 'news':
        return <NewsView />;

      case 'news-detail':
        return <NewsDetailView key={route.params.slug} slug={route.params.slug} />;

      case 'music-home':
        return <MusicHomeView />;

      case 'music-releases':
        return <MusicReleasesView />;

      case 'music-new':
        return <MusicNewReleasesView />;

      case 'music-artists':
        return <MusicArtistsView />;

      case 'music-genres':
        return <MusicGenresView />;

      case 'music-search':
        return <MusicSearchView />;

      case 'music-library':
        return <MusicLibraryView />;

      case 'music-studio':
        return <MusicStudioView />;

      case 'music-release-editor':
        return (
          <MusicReleaseEditorView
            mode={(route.params.mode as 'new' | 'edit') || 'new'}
            releaseId={route.params.id}
          />
        );

      case 'music-artist':
        return <ArtistProfileView key={route.params.idOrSlug} idOrSlug={route.params.idOrSlug} />;

      case 'music-release':
        return <MusicReleaseView key={route.params.idOrSlug} idOrSlug={route.params.idOrSlug} />;

      case 'notifications':
        return <NotificationCenterView onNavigate={navigate} />;

      case 'feedback':
        return (
          <>
            <HomeView
              onNavigate={(tab) => {
                if (tab === 'profile') {
                  navigate(dbUser ? `/u/${dbUser.username}` : '/profile');
                } else {
                  navigate(`/${tab === 'home' ? '' : tab}`);
                }
              }}
            />
            <FeedbackModal
              isOpen={true}
              initialTicketId={route.params?.id ? parseInt(route.params.id, 10) : null}
              onClose={() => navigate('/')}
            />
          </>
        );

      case 'settings':
        return (
          <SettingsView
            onNavigateProfile={() => (dbUser ? navigate(`/u/${dbUser.username}`) : navigate('/profile'))}
          />
        );

      case 'home':
      default:
        return (
          <HomeView
            onNavigate={(tab) => {
              if (tab === 'profile') {
                navigate(dbUser ? `/u/${dbUser.username}` : '/profile');
              } else {
                navigate(`/${tab === 'home' ? '' : tab}`);
              }
            }}
          />
        );
    }
  };

  return (
    <AppShell>
      <AnnouncementBanner />
      {renderView()}
      {dbUser && <MiniMessenger />}
    </AppShell>
  );
}

function NotificationWrapper({ children }: { children: React.ReactNode }) {
  const { navigate } = useRouter();
  return (
    <NotificationProvider onNavigate={navigate}>
      {children}
    </NotificationProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <NotificationWrapper>
          <ShareProvider>
            <MusicPlayerProvider>
              <ErrorBoundary><MainApp /></ErrorBoundary>
            </MusicPlayerProvider>
          </ShareProvider>
        </NotificationWrapper>
      </RouterProvider>
    </AuthProvider>
  );
}
