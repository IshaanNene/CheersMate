/**
 * Layout Component - Extended with Sorting, Filtering & Feature Controls
 */
import React, { useState } from 'react';
import {
    Package, Zap, Settings, Search, Terminal, Filter,
    ArrowDownAZ, ArrowUpAZ, RefreshCw, Star, Clock, GitBranch, ChevronDown, X, Heart
} from 'lucide-react';
import type { SortOption, FilterOption } from '../types';

interface LayoutProps {
    children: React.ReactNode;
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
    activeTab?: 'packages' | 'services' | 'discover' | 'settings';
    onTabChange?: (tab: 'packages' | 'services' | 'discover' | 'settings') => void;
    sortBy?: SortOption;
    onSortChange?: (sort: SortOption) => void;
    filterBy?: FilterOption;
    onFilterChange?: (filter: FilterOption) => void;
    onRefresh?: () => void;
    packageCount?: number;
    filteredCount?: number;
}

export const Layout: React.FC<LayoutProps> = ({
    children,
    searchQuery,
    onSearchChange,
    activeTab = 'packages',
    onTabChange,
    sortBy = 'name-asc',
    onSortChange,
    filterBy = 'all',
    onFilterChange,
    onRefresh,
    packageCount = 0,
    filteredCount = 0
}) => {
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);

    const sortOptions: { value: SortOption; label: string; icon: React.ReactNode }[] = [
        { value: 'name-asc', label: 'A → Z', icon: <ArrowDownAZ size={16} /> },
        { value: 'name-desc', label: 'Z → A', icon: <ArrowUpAZ size={16} /> },
        { value: 'date-desc', label: 'Recently Installed', icon: <Clock size={16} /> },
        { value: 'deps-desc', label: 'Most Dependencies', icon: <GitBranch size={16} /> },
    ];

    const filterOptions: { value: FilterOption; label: string; icon: React.ReactNode }[] = [
        { value: 'all', label: 'All Packages', icon: <Package size={16} /> },
        { value: 'updates', label: 'Has Updates', icon: <RefreshCw size={16} /> },
        { value: 'favorites', label: 'Favorites', icon: <Heart size={16} /> },
        { value: 'pinned', label: 'Pinned', icon: <Star size={16} /> },
        { value: 'casks', label: 'Casks (GUI)', icon: <Package size={16} /> },
        { value: 'formulae', label: 'Formulae (CLI)', icon: <Terminal size={16} /> },
    ];

    const currentSort = sortOptions.find(s => s.value === sortBy) || sortOptions[0];
    const currentFilter = filterOptions.find(f => f.value === filterBy) || filterOptions[0];

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-app)' }}>
            {/* Sidebar */}
            <aside style={{
                width: '280px',
                borderRight: '3px solid var(--neo-black)',
                background: 'var(--bg-panel)',
                display: 'flex',
                flexDirection: 'column',
                padding: '24px',
                zIndex: 10
            }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
                    <div style={{
                        width: '48px', height: '48px',
                        background: 'var(--neo-peach)',
                        border: '3px solid var(--neo-black)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--neo-black)',
                        boxShadow: 'var(--shadow-md)'
                    }}>
                        <Terminal size={24} strokeWidth={3} />
                    </div>
                    <div>
                        <h1 style={{
                            fontSize: '1.3rem',
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            lineHeight: '1.1',
                            color: 'var(--text-primary)'
                        }}>
                            Cheers<br />Mate
                        </h1>
                    </div>
                </div>

                {/* Navigation */}
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <NavItem
                        icon={<Package size={20} />}
                        label="Packages"
                        active={activeTab === 'packages'}
                        onClick={() => onTabChange?.('packages')}
                    />
                    <NavItem
                        icon={<Zap size={20} />}
                        label="Services"
                        active={activeTab === 'services'}
                        onClick={() => onTabChange?.('services')}
                    />
                    <NavItem
                        icon={<Search size={20} />}
                        label="Discover"
                        active={activeTab === 'discover'}
                        onClick={() => onTabChange?.('discover')}
                    />
                    <NavItem
                        icon={<Settings size={20} />}
                        label="Settings"
                        active={activeTab === 'settings'}
                        onClick={() => onTabChange?.('settings')}
                    />
                </nav>

                {/* Package Count */}
                {activeTab === 'packages' && packageCount > 0 && (
                    <div style={{
                        marginTop: '24px',
                        padding: '12px',
                        background: 'var(--neo-white)',
                        border: '2px solid var(--neo-black)',
                        borderRadius: 'var(--radius-md)',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--neo-coral)' }}>
                            {filteredCount}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            {filteredCount === packageCount ? 'Packages' : `of ${packageCount}`}
                        </div>
                    </div>
                )}

                {/* Status Footer */}
                <div style={{ marginTop: 'auto' }}>
                    <div className="status-indicator status-online" style={{
                        width: '100%',
                        justifyContent: 'center'
                    }}>
                        <span className="status-dot" />
                        <span>ONLINE</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <header style={{
                    marginBottom: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                }}>
                    {/* Search & Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
                        {/* Search Box */}
                        <div className="neo-search" style={{ width: '400px', height: '100%' }}>
                            <Search size={20} color="var(--text-secondary)" />
                            <input
                                type="text"
                                placeholder={activeTab === 'services' ? "SEARCH SERVICES..." : "SEARCH PACKAGES..."}
                                value={searchQuery || ''}
                                onChange={(e) => onSearchChange?.(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => onSearchChange?.('')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-secondary)',
                                        padding: '4px'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        {/* Refresh Button */}
                        <button
                            className="btn btn-primary"
                            onClick={onRefresh}
                            style={{ height: '100%' }}
                        >
                            <RefreshCw size={18} style={{background: 'ffffff', marginRight: '8px' }} /> REFRESH
                        </button>
                    </div>

                    {/* Toolbar - Package View Only */}
                    {activeTab === 'packages' && (
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Sort Dropdown */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => { setShowSortDropdown(!showSortDropdown); setShowFilterDropdown(false); }}
                                    className="btn btn-outline"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    {currentSort.icon}
                                    <span>{currentSort.label}</span>
                                    <ChevronDown size={16} style={{
                                        transform: showSortDropdown ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 0.2s'
                                    }} />
                                </button>

                                {showSortDropdown && (
                                    <DropdownMenu
                                        items={sortOptions}
                                        selected={sortBy}
                                        onSelect={(value) => { onSortChange?.(value as SortOption); setShowSortDropdown(false); }}
                                    />
                                )}
                            </div>

                            {/* Filter Dropdown */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => { setShowFilterDropdown(!showFilterDropdown); setShowSortDropdown(false); }}
                                    className={filterBy !== 'all' ? 'btn btn-secondary' : 'btn btn-outline'}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <Filter size={16} />
                                    <span>{currentFilter.label}</span>
                                    <ChevronDown size={16} style={{
                                        transform: showFilterDropdown ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 0.2s'
                                    }} />
                                </button>

                                {showFilterDropdown && (
                                    <DropdownMenu
                                        items={filterOptions}
                                        selected={filterBy}
                                        onSelect={(value) => { onFilterChange?.(value as FilterOption); setShowFilterDropdown(false); }}
                                    />
                                )}
                            </div>

                            {/* Active Filter Badges */}
                            {filterBy !== 'all' && (
                                <div
                                    className="neo-badge neo-badge-coral"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => onFilterChange?.('all')}
                                >
                                    {currentFilter.label} <X size={12} style={{ marginLeft: '4px' }} />
                                </div>
                            )}
                        </div>
                    )}
                </header>

                {/* Scrollable Content Area */}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
                    {children}
                </div>
            </main>
        </div>
    );
};

const NavItem = ({ icon, label, active = false, onClick }: {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
}) => (
    <div
        onClick={onClick}
        className="neo-nav-item"
        style={{
            background: active ? 'var(--neo-peach)' : 'var(--neo-white)',
            color: active ? 'var(--neo-black)' : 'var(--text-primary)',
            boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)',
            transform: active ? 'translate(-2px, -2px)' : 'none',
        }}
    >
        {icon}
        <span>{label}</span>
    </div>
);

const DropdownMenu = ({
    items,
    selected,
    onSelect
}: {
    items: { value: string; label: string; icon: React.ReactNode }[];
    selected: string;
    onSelect: (value: string) => void;
}) => (
    <div style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: '8px',
        background: 'var(--neo-white)',
        border: '3px solid var(--neo-black)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 100,
        minWidth: '200px',
        overflow: 'hidden'
    }}>
        {items.map((item) => (
            <div
                key={item.value}
                onClick={() => onSelect(item.value)}
                style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    background: selected === item.value ? 'var(--neo-skin)' : 'transparent',
                    fontWeight: selected === item.value ? 700 : 500,
                    borderBottom: '1px solid var(--neo-skin)',
                    transition: 'background 0.1s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--neo-skin)'}
                onMouseLeave={(e) => e.currentTarget.style.background = selected === item.value ? 'var(--neo-skin)' : 'transparent'}
            >
                {item.icon}
                <span style={{ textTransform: 'uppercase', fontSize: '0.85rem' }}>{item.label}</span>
            </div>
        ))}
    </div>
);

// Re-export types for convenience
export type { SortOption } from '../types';
