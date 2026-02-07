/**
 * Discover Page - Warm Neo-Brutalism Theme
 * 
 * Full-width centered layout with prominent search.
 */
import React, { useState } from 'react';
import { Search, Download, Loader, Sparkles } from 'lucide-react';

export const Discover: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<string[]>([]);
    const [searching, setSearching] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setSearching(true);
        setResults([]);

        fetch(`http://localhost:8080/api/packages/search?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                setResults(data || []);
                setSearching(false);
            })
            .catch(err => {
                console.error(err);
                setSearching(false);
            });
    };

    const handleInstall = (pkg: string) => {
        setInstalling(pkg);
        setTimeout(() => {
            setInstalling(null);
            alert(`Install command sent for ${pkg}`);
        }, 1000);
    };

    return (
        <div className="animate-entry" style={{
            width: '100%',
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 20px'
        }}>
            {/* Hero Header */}
            <div style={{
                marginBottom: '48px',
                textAlign: 'center',
                paddingTop: '40px'
            }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                    padding: '8px 16px',
                    background: 'var(--neo-skin)',
                    border: '3px solid var(--neo-black)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <Sparkles size={20} />
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                        Homebrew Package Search
                    </span>
                </div>
                <h2 className="heading-xl" style={{ marginBottom: '16px' }}>
                    Discover Packages
                </h2>
                <p style={{
                    color: 'var(--text-secondary)',
                    fontSize: '1.15rem',
                    maxWidth: '500px',
                    margin: '0 auto'
                }}>
                    Find and install new tools from Homebrew's vast collection of packages.
                </p>
            </div>

            {/* Search Form - Centered & Prominent */}
            <form onSubmit={handleSearch} style={{
                maxWidth: '700px',
                margin: '0 auto 60px',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--neo-white)',
                    border: '3px solid var(--neo-black)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        padding: '0 20px',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <Search size={24} color="var(--text-secondary)" />
                    </div>
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search for packages..."
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            outline: 'none',
                            padding: '18px 0',
                            fontFamily: 'inherit'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={searching}
                        className="btn btn-primary"
                        style={{
                            margin: '8px',
                            padding: '14px 28px',
                            fontSize: '1rem',
                            borderRadius: 'var(--radius-md)'
                        }}
                    >
                        {searching ? 'SEARCHING...' : 'SEARCH'}
                    </button>
                </div>
            </form>

            {/* Results Area */}
            <div style={{ width: '100%' }}>
                {/* Loading State */}
                {searching && (
                    <div style={{
                        textAlign: 'center',
                        padding: '80px 0',
                        color: 'var(--text-secondary)'
                    }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            margin: '0 auto 24px',
                            background: 'var(--neo-skin)',
                            border: '3px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 'var(--shadow-md)'
                        }}>
                            <Loader className="spin" size={40} style={{ color: 'var(--neo-coral)' }} />
                        </div>
                        <p style={{ fontSize: '1.2rem', fontWeight: 700, textTransform: 'uppercase' }}>
                            Searching Homebrew...
                        </p>
                    </div>
                )}

                {/* Results Grid */}
                {!searching && results.length > 0 && (
                    <>
                        <div style={{
                            marginBottom: '24px',
                            padding: '12px 16px',
                            background: 'var(--neo-skin)',
                            border: '2px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            display: 'inline-block'
                        }}>
                            <span style={{ fontWeight: 700 }}>
                                Found {results.length} packages
                            </span>
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '20px'
                        }}>
                            {results.map(pkg => (
                                <div
                                    key={pkg}
                                    className="neo-card"
                                    style={{
                                        padding: '24px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '16px'
                                    }}
                                >
                                    <div style={{
                                        fontWeight: 800,
                                        fontSize: '1.15rem',
                                        textTransform: 'uppercase',
                                        color: 'var(--text-primary)'
                                    }}>
                                        {pkg}
                                    </div>
                                    <button
                                        className={installing === pkg ? 'btn btn-outline' : 'btn btn-primary'}
                                        onClick={() => handleInstall(pkg)}
                                        disabled={!!installing}
                                        style={{
                                            marginTop: 'auto',
                                            width: '100%',
                                            justifyContent: 'center',
                                            gap: '10px'
                                        }}
                                    >
                                        {installing === pkg ? (
                                            <Loader size={18} className="spin" />
                                        ) : (
                                            <Download size={18} />
                                        )}
                                        {installing === pkg ? 'INSTALLING...' : 'INSTALL'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* No Results State */}
                {!searching && results.length === 0 && query && (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 0',
                        color: 'var(--text-secondary)'
                    }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            margin: '0 auto 24px',
                            background: 'var(--neo-white)',
                            border: '3px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            <Search size={32} />
                        </div>
                        <p style={{ fontSize: '1.2rem', fontWeight: 700, textTransform: 'uppercase' }}>
                            No packages found
                        </p>
                        <p style={{ marginTop: '8px' }}>
                            Try a different search term
                        </p>
                    </div>
                )}

                {/* Empty State */}
                {!searching && results.length === 0 && !query && (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 0',
                        color: 'var(--text-secondary)'
                    }}>
                        <p style={{ fontSize: '1.1rem' }}>
                            Enter a search term above to find packages
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
