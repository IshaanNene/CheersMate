/**
 * Main App Component - Extended with Full Sorting, Filtering & Features
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Layout } from './components/Layout';
import { PackageCard } from './components/PackageCard';
import { ServiceCard } from './components/ServiceCard';
import { PackageModal } from './components/PackageModal';
import { Discover } from './pages/Discover';
import { Settings } from './pages/Settings';
import type { BrewPackage, BrewService, SortOption, FilterOption } from './types';
import {
  getUserData,
  trackPackageAccess,
  getUsageStats,
  isFavorite,
  detectCategory
} from './userStore';
import './index.css';

type Tab = 'packages' | 'services' | 'discover' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('packages');
  const [packages, setPackages] = useState<BrewPackage[]>([]);
  const [services, setServices] = useState<BrewService[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<BrewPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Extended State for Sorting/Filtering
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  // Refresh user data when favorites/groups change
  const [userDataVersion, setUserDataVersion] = useState(0);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    const endpoint = activeTab === 'services' ? 'services' : 'packages';

    fetch(`http://localhost:8080/api/${endpoint}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
        return res.json();
      })
      .then(data => {
        if (activeTab === 'services') {
          setServices(data || []);
        } else {
          // Enrich packages with computed fields
          const enrichedPackages = (data || []).map((pkg: BrewPackage) => ({
            ...pkg,
            category: detectCategory(pkg),
            is_leaf: !packages.some(other =>
              other.dependencies?.includes(pkg.name)
            )
          }));
          setPackages(enrichedPackages);

          // Update selected package if it's open
          if (selectedPackage) {
            const refreshed = enrichedPackages.find((p: BrewPackage) => p.name === selectedPackage.name);
            if (refreshed) setSelectedPackage(refreshed);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Could not connect to Homebrew Backend. Please restart the backend server!');
        setLoading(false);
      });
  }, [activeTab, selectedPackage]);

  useEffect(() => {
    fetchData();
    setSearch('');
  }, [activeTab]);

  // Handle package selection with usage tracking
  const handlePackageClick = useCallback((pkg: BrewPackage) => {
    trackPackageAccess(pkg.name);
    setSelectedPackage(pkg);
    setUserDataVersion(v => v + 1); // Trigger re-render for usage stats
  }, []);

  // Filtered and Sorted Items
  const filteredItems = useMemo(() => {
    let items: BrewPackage[] = [...packages];
    const userData = getUserData();

    // Text Search
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.desc && p.desc.toLowerCase().includes(q))
      );
    }

    // Apply Filter
    switch (filterBy) {
      case 'updates':
        items = items.filter(p => p.outdated);
        break;
      case 'pinned':
        items = items.filter(p => p.pinned);
        break;
      case 'favorites':
        items = items.filter(p => userData.favorites.includes(p.name));
        break;
      case 'casks':
        items = items.filter(p => p.full_name?.includes('/cask/') || p.is_cask);
        break;
      case 'formulae':
        items = items.filter(p => !p.full_name?.includes('/cask/') && !p.is_cask);
        break;
      case 'leaf':
        // Leaf packages = nothing depends on them
        const allDeps = new Set(packages.flatMap(p => p.dependencies || []));
        items = items.filter(p => !allDeps.has(p.name));
        break;
      default:
        break;
    }

    // Apply Sort
    const usageStats = getUsageStats();

    items.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'size-desc':
          return (b.installed_size || 0) - (a.installed_size || 0);
        case 'size-asc':
          return (a.installed_size || 0) - (b.installed_size || 0);
        case 'date-desc':
          // Sort by install date (most recent first)
          const dateA = a.install_date ? new Date(a.install_date).getTime() : 0;
          const dateB = b.install_date ? new Date(b.install_date).getTime() : 0;
          if (dateA === 0 && dateB === 0) return a.name.localeCompare(b.name);
          return dateB - dateA;
        case 'deps-desc':
          return (b.dependencies?.length || 0) - (a.dependencies?.length || 0);
        case 'frequency-desc':
          const aCount = usageStats[a.name]?.clickCount || 0;
          const bCount = usageStats[b.name]?.clickCount || 0;
          return bCount - aCount;
        default:
          return 0;
      }
    });

    return items;
  }, [packages, search, sortBy, filterBy, userDataVersion]);

  // Filtered Services
  const filteredServices = useMemo(() => {
    if (!search) return services;
    const q = search.toLowerCase();
    return services.filter(s => s.name.toLowerCase().includes(q));
  }, [services, search]);

  const handleRefresh = useCallback(() => {
    setUserDataVersion(v => v + 1);
    fetchData();
  }, [fetchData]);

  // Render Package Grid
  const renderPackageGrid = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: '20px',
      paddingBottom: '24px'
    }}>
      {filteredItems.map((pkg) => (
        <PackageCard
          key={pkg.name}
          pkg={pkg}
          onRefresh={handleRefresh}
          onClick={() => handlePackageClick(pkg)}
          isFavorite={isFavorite(pkg.name)}
          onFavoriteChange={() => setUserDataVersion(v => v + 1)}
        />
      ))}
    </div>
  );

  // Render Service Grid
  const renderServiceGrid = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: '20px',
      paddingBottom: '24px'
    }}>
      {filteredServices.map((svc) => (
        <ServiceCard key={svc.name} service={svc} onRefresh={handleRefresh} />
      ))}
    </div>
  );

  return (
    <>
      <Layout
        searchQuery={search}
        onSearchChange={setSearch}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sortBy={sortBy}
        onSortChange={setSortBy}
        filterBy={filterBy}
        onFilterChange={setFilterBy}
        onRefresh={handleRefresh}
        packageCount={packages.length}
        filteredCount={filteredItems.length}
      >
        {loading && (packages.length === 0 || services.length === 0) ? (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--text-secondary)'
          }}>
            <div className="loading-spinner" style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 20px',
              border: '4px solid var(--neo-skin)',
              borderTop: '4px solid var(--neo-peach)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ fontWeight: 600, textTransform: 'uppercase' }}>
              Loading {activeTab}...
            </p>
          </div>
        ) : error ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            background: 'var(--neo-white)',
            border: '3px solid var(--error)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)'
          }}>
            <p style={{ color: 'var(--error)', fontWeight: 700, marginBottom: '12px' }}>
              {error}
            </p>
            <code style={{
              display: 'block',
              padding: '12px',
              background: 'var(--neo-black)',
              color: 'var(--neo-white)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-mono)'
            }}>
              cd backend && go run main.go
            </code>
          </div>
        ) : activeTab === 'packages' ? (
          filteredItems.length === 0 ? (
            <div style={{
              padding: '60px',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>
                No packages found
              </p>
              <p>Try adjusting your search or filter</p>
            </div>
          ) : renderPackageGrid()
        ) : activeTab === 'services' ? (
          filteredServices.length === 0 ? (
            <div style={{
              padding: '60px',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>
                No services found
              </p>
              <p>Install packages with services to see them here</p>
            </div>
          ) : renderServiceGrid()
        ) : activeTab === 'discover' ? (
          <Discover />
        ) : (
          <Settings
            onRefresh={handleRefresh}
            packages={packages}
          />
        )}
      </Layout>

      <PackageModal
        pkg={selectedPackage}
        onClose={() => setSelectedPackage(null)}
        onRefresh={handleRefresh}
      />
    </>
  );
}

export default App;
