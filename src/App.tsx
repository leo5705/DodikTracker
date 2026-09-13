import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { RouterProvider, useRouter } from './context/RouterContext.tsx';
import { Navigation, ActiveTab } from './components/Navigation.tsx';
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
import { ProfileView } from './components/views/ProfileView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';
import { NotificationCenterView } from './components/views/NotificationCenterView.tsx';
import { MediaDetailView } from './components/views/MediaDetailView.tsx';
import { TierListDetailView } from './components/views/TierListDetailView.tsx';
import { ListDetailView } from './components/views/ListDetailView.tsx';
import { LibraryImportView } from './components/views/LibraryImportView.tsx';
import { LibraryExportView } from './components/views/LibraryExportView.tsx';
import { AuthGatekeeper } from './components/auth/AuthGatekeeper.tsx';
import { ResetPasswordView } from './components/auth/ResetPasswordView.tsx';
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
      <div className="min-h-screen bg-[#0A090D] flex flex-col items-center justify-center text-[#9A94AA] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#AC82FF]" />
        <span className="text-xs font-medium tracking-wide">Загрузка Dodik Tracker...</span>
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
      case 'media-detail':
        return (
          <MediaDetailView
            key={`${route.params.type || 'media'}-${route.params.id}`}
            mediaId={parseInt(route.params.id, 10)}
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

      case 'notifications':
        return <NotificationCenterView onNavigate={navigate} />;
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
    <div className="min-h-screen bg-[#0F0E12] text-[#F3F1F8] flex flex-col md:flex-row antialiased selection:bg-[#9B6BFF] selection:text-white">
      {/* Desktop Sidebar & Mobile Nav */}
      <Navigation
        activeTab="home"
        setActiveTab={() => {}}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        onOpenProfile={() => navigate(dbUser ? `/u/${dbUser.username}` : '/profile')}
        onOpenSettings={() => navigate('/settings')}
      />

      {/* Main View Area */}
      <main className="flex-1 min-w-0 pt-16 md:pt-0 pb-20 md:pb-8 px-4 sm:px-6 lg:px-10 max-w-7xl mx-auto w-full">
        <div className="py-6 sm:py-8">{renderView()}</div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <ErrorBoundary><MainApp /></ErrorBoundary>
      </RouterProvider>
    </AuthProvider>
  );
}
