import React, { useState, useEffect } from 'react';
import type { BrewPackage } from '../types';
import { X, Layers, AlertTriangle, Link, Terminal } from 'lucide-react';
import { getLogoUrl, getUiAvatar } from '../utils';

interface PackageModalProps {
    pkg: BrewPackage | null;
    onClose: () => void;
    onRefresh?: () => void;
}

export const PackageModal: React.FC<PackageModalProps> = ({ pkg, onClose }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'usage'>('details');
    const [usage, setUsage] = useState<string | null>(null);
    const [loadingUsage, setLoadingUsage] = useState(false);

    useEffect(() => {
        if (pkg && activeTab === 'usage' && !usage) {
            setLoadingUsage(true);
            fetch(`http://localhost:8080/api/packages/usage?name=${pkg.name}`)
                .then(res => res.json())
                .then(data => {
                    setUsage(data.usage || 'No usage examples found.');
                    setLoadingUsage(false);
                })
                .catch(err => {
                    console.error(err);
                    setUsage('Failed to load usage examples.');
                    setLoadingUsage(false);
                });
        }
    }, [pkg, activeTab, usage]);

    // Reset state when opening new package
    useEffect(() => {
        setActiveTab('details');
        setUsage(null);
    }, [pkg]);

    if (!pkg) return null;

    const logoData = getLogoUrl(pkg.homepage);

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-out'
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-card)',
                width: '700px',
                maxWidth: '90vw',
                maxHeight: '85vh',
                border: '3px solid #000',
                boxShadow: '8px 8px 0 0 #000',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '24px', borderBottom: '3px solid #000', display: 'flex', gap: '20px', background: 'var(--accent-secondary)' }}>
                    {logoData ? (
                        <img src={logoData.primary} alt={pkg.name} style={{ width: '64px', height: '64px', border: '2px solid #000', objectFit: 'contain', background: '#fff', padding: '8px', boxShadow: '4px 4px 0 0 #000' }}
                            onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                if (img.src === logoData.primary) {
                                    img.src = logoData.fallback;
                                } else if (img.src === logoData.fallback) {
                                    img.src = getUiAvatar(pkg.name);
                                }
                            }}
                        />
                    ) : (
                        <img src={getUiAvatar(pkg.name)} alt={pkg.name} style={{ width: '64px', height: '64px', border: '2px solid #000', boxShadow: '4px 4px 0 0 #000' }} />
                    )}


                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, textTransform: 'uppercase' }}>{pkg.name}</h2>
                            <button onClick={onClose} style={{ background: '#000', border: '2px solid #000', color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <p style={{ color: '#000', marginTop: '4px', fontSize: '1rem', fontWeight: 600 }}>{pkg.full_name}</p>

                        <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                            <button
                                onClick={() => setActiveTab('details')}
                                style={{
                                    background: activeTab === 'details' ? '#000' : 'transparent',
                                    border: '2px solid #000',
                                    padding: '6px 16px',
                                    color: activeTab === 'details' ? '#fff' : '#000',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    boxShadow: activeTab === 'details' ? 'none' : '2px 2px 0 0 #000',
                                    transform: activeTab === 'details' ? 'translate(2px, 2px)' : 'none'
                                }}
                            >
                                Details
                            </button>
                            <button
                                onClick={() => setActiveTab('usage')}
                                style={{
                                    background: activeTab === 'usage' ? '#000' : 'transparent',
                                    border: '2px solid #000',
                                    padding: '6px 16px',
                                    color: activeTab === 'usage' ? '#fff' : '#000',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    textTransform: 'uppercase',
                                    boxShadow: activeTab === 'usage' ? 'none' : '2px 2px 0 0 #000',
                                    transform: activeTab === 'usage' ? 'translate(2px, 2px)' : 'none'
                                }}
                            >
                                <Terminal size={14} /> Usage
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div style={{ padding: '32px', overflowY: 'auto', flex: 1, background: 'var(--bg-main)' }}>

                    {activeTab === 'details' ? (
                        <>
                            <section style={{ marginBottom: '32px' }}>
                                <h4 style={{ fontSize: '1rem', color: '#000', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 800, borderBottom: '2px solid #000', display: 'inline-block', paddingBottom: '4px' }}>Description</h4>
                                <p style={{ lineHeight: '1.6', fontSize: '1.1rem' }}>{pkg.desc}</p>
                                <a href={pkg.homepage} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 700, borderBottom: '2px solid var(--accent-color)' }}>
                                    <Link size={16} /> {pkg.homepage}
                                </a>
                            </section>

                            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', fontSize: '1rem' }}>
                                <div style={{ background: '#fff', padding: '8px 16px', border: '2px solid #000', boxShadow: '3px 3px 0 0 #000' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Installed: </span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>v{pkg.installed?.[0]?.version}</span>
                                </div>
                                {pkg.pinned && (
                                    <div style={{ background: 'var(--accent-color)', color: '#000', padding: '8px 16px', border: '2px solid #000', fontWeight: 800, transform: 'rotate(-2deg)' }}>
                                        PINNED
                                    </div>
                                )}
                            </div>

                            {(pkg.dependencies?.length > 0 || pkg.build_dependencies?.length > 0) && (
                                <section style={{ marginBottom: '32px' }}>
                                    <h4 style={{ fontSize: '1rem', color: '#000', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Layers size={18} /> Dependencies
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                        {pkg.dependencies?.map(dep => (
                                            <span key={dep} style={{ padding: '6px 12px', border: '2px solid #000', background: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>{dep}</span>
                                        ))}
                                        {pkg.build_dependencies?.map(dep => (
                                            <span key={dep} style={{ padding: '6px 12px', border: '2px solid #000', background: '#eee', color: '#666', fontSize: '0.9rem', fontWeight: 600 }}>{dep} (build)</span>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {pkg.caveats && (
                                <section style={{ marginBottom: '24px', padding: '24px', background: '#ffe4e6', border: '3px solid #000', boxShadow: '6px 6px 0 0 #000' }}>
                                    <h4 style={{ fontSize: '1.1rem', color: '#e11d48', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <AlertTriangle size={20} /> Setup & Usage
                                    </h4>
                                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.9rem', margin: 0, color: '#000' }}>
                                        {pkg.caveats}
                                    </pre>
                                </section>
                            )}
                        </>
                    ) : (
                        <div className="animate-entry">
                            <div style={{
                                background: '#1e1e1e',
                                padding: '24px',
                                border: '3px solid #000',
                                minHeight: '300px',
                                boxShadow: '6px 6px 0 0 #000'
                            }}>
                                {loadingUsage ? (
                                    <div style={{ color: '#888', textAlign: 'center', padding: '40px', fontFamily: 'monospace' }}>Loading usage examples...</div>
                                ) : (
                                    <pre style={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.95rem',
                                        lineHeight: '1.6',
                                        color: '#eee',
                                        whiteSpace: 'pre-wrap',
                                        margin: 0
                                    }}>
                                        {usage}
                                    </pre>
                                )}
                            </div>
                            <div style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                <span>SOURCE: CHEAT.SH</span>
                                <span>POWERED BY COMMUNITY</span>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer Actions */}
                <div style={{ padding: '16px 24px', borderTop: '3px solid #000', background: '#fff', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn" onClick={onClose} style={{ background: 'var(--accent-secondary)', border: '2px solid #000', color: '#000', fontWeight: 700, padding: '8px 24px', boxShadow: '2px 2px 0 0 #000' }}>CLOSE</button>
                    {/* We could duplicate actions here but cards have them already */}
                </div>
            </div>
        </div>
    );
};
