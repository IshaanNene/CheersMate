/**
 * PackageCard Component - Extended with Favorites, Groups & Usage Stats
 */
import React, { useState } from 'react';
import {
    Globe, RefreshCw, Trash2, Heart, GitBranch, FolderPlus, Pin, ArrowUp
} from 'lucide-react';
import type { BrewPackage, PackageGroup } from '../types';
import {
    toggleFavorite,
    getPackageUsageCount,
    getGroups,
    addToGroup,
    addToUninstalled
} from '../userStore';

interface PackageCardProps {
    pkg: BrewPackage;
    onRefresh?: () => void;
    onClick?: () => void;
    isFavorite?: boolean;
    onFavoriteChange?: () => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({
    pkg,
    onRefresh,
    onClick,
    isFavorite = false,
    onFavoriteChange
}) => {
    const [loading, setLoading] = useState<string | null>(null);
    const [showGroupMenu, setShowGroupMenu] = useState(false);

    const usageCount = getPackageUsageCount(pkg.name);
    const groups = getGroups();

    const handleAction = async (action: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setLoading(action);
        setShowGroupMenu(false);

        try {
            const response = await fetch(`http://localhost:8080/api/packages/${pkg.name}/${action}`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error(`Failed to ${action} package`);
            }

            // Track uninstall for history
            if (action === 'uninstall') {
                addToUninstalled(pkg);
            }

            onRefresh?.();
        } catch (err) {
            console.error(`Error ${action}ing package:`, err);
            alert(`Failed to ${action} ${pkg.name}`);
        } finally {
            setLoading(null);
        }
    };

    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleFavorite(pkg.name);
        onFavoriteChange?.();
    };

    const handleAddToGroup = (group: PackageGroup, e: React.MouseEvent) => {
        e.stopPropagation();
        addToGroup(group.id, pkg.name);
        setShowGroupMenu(false);
        onFavoriteChange?.();
    };

    const getLogo = () => {
        if (pkg.homepage) {
            try {
                const domain = new URL(pkg.homepage).hostname;
                return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
            } catch {
                return null;
            }
        }
        return null;
    };

    return (
        <div
            className="neo-card animate-entry"
            onClick={onClick}
            style={{
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                position: 'relative',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translate(-3px, -3px)';
                e.currentTarget.style.boxShadow = '7px 7px 0 0 var(--neo-black)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
        >
            {/* Header Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                    {/* Logo */}
                    <div style={{
                        width: '44px',
                        height: '44px',
                        background: 'ffffff',
                        border: '2px solid var(--neo-black)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0
                    }}>
                        {getLogo() ? (
                            <img
                                src={getLogo()!}
                                alt=""
                                style={{ width: '28px', height: '28px' }}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        ) : (
                            <span style={{
                                fontSize: '1.2rem',
                                fontWeight: 900,
                                color: 'var(--neo-black)'
                            }}>
                                {pkg.name[0].toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* Name & Version */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{
                            fontSize: '1rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            marginBottom: '4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}>
                            {pkg.name}
                        </h3>
                        <code style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-mono)'
                        }}>
                            v{pkg.installed[0]?.version || 'unknown'}
                        </code>
                    </div>
                </div>

                {/* Favorite & Menu Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleFavoriteClick}
                        style={{
                            background: isFavorite ? 'var(--neo-white)' : 'var(--neo-white)',
                            border: '2px solid var(--neo-black)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '6px',
                            cursor: 'pointer',
                            color: isFavorite ? 'var(--neo-white)' : 'var(--text-secondary)',
                            transition: 'all 0.1s'
                        }}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                        <Heart size={16} fill={isFavorite ? 'red' : 'none'}/>
                    </button>
                </div>
            </div>

            {/* Badges Row */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>

                {pkg.outdated && (
                    <span className="neo-badge neo-badge-coral">
                        <RefreshCw size={12} /> UPDATE
                    </span>
                )}
                {pkg.dependencies && pkg.dependencies.length > 0 && (
                    <span className="neo-badge neo-badge-skin">
                        <GitBranch size={12} /> {pkg.dependencies.length} DEPS
                    </span>
                )}
            </div>

            {/* Description */}
            <p style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                flex: 1,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
            }}>
                {pkg.desc || 'No description available'}
            </p>

            {/* Divider */}
            <div style={{
                height: '2px',
                background: 'var(--neo-peach)',
                margin: '4px 0'
            }} />

            {/* Actions Row */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                {/* Left Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    {pkg.homepage && (
                        <a
                            href={pkg.homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="icon-btn"
                            title="Visit homepage"
                        >
                            <Globe size={18} />
                        </a>
                    )}

                    {/* Add to Group */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowGroupMenu(!showGroupMenu); }}
                            className="icon-btn"
                            title="Add to group"
                        >
                            <FolderPlus size={18} />
                        </button>

                        {showGroupMenu && groups.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: 0,
                                marginBottom: '8px',
                                background: 'var(--neo-white)',
                                border: '2px solid var(--neo-black)',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-md)',
                                zIndex: 50,
                                minWidth: '150px'
                            }}>
                                {groups.map(group => (
                                    <div
                                        key={group.id}
                                        onClick={(e) => handleAddToGroup(group, e)}
                                        style={{
                                            padding: '10px 14px',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            borderBottom: '1px solid var(--neo-skin)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <span style={{
                                            width: '10px',
                                            height: '10px',
                                            background: group.color,
                                            borderRadius: '50%',
                                            border: '1px solid var(--neo-black)'
                                        }} />
                                        {group.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    {pkg.outdated && (
                        <button
                            onClick={(e) => handleAction('upgrade', e)}
                            disabled={loading !== null}
                            className="icon-btn"
                            style={{
                                padding: '6px',
                                border: 'none',
                                background: 'transparent',
                                color: 'inherit'
                            }}
                            title="Upgrade package"
                        >
                            {loading === 'upgrade' ? '...' : <ArrowUp size={18} />}
                        </button>
                    )}

                    <button
                        onClick={(e) => handleAction(pkg.pinned ? 'unpin' : 'pin', e)}
                        disabled={loading !== null}
                        className="icon-btn"
                        style={{
                            padding: '6px',
                            border: 'none',
                            background: 'transparent',
                            color: pkg.pinned ? 'rgba(34,197,94,0.85)' : 'inherit'
                        }}
                        title={pkg.pinned ? 'Unpin package' : 'Pin package'}
                    >
                        {loading === 'pin' || loading === 'unpin' ? '...' : <Pin size={18} strokeWidth={1.5} fill={pkg.pinned ? 'currentColor' : 'none'} />}
                    </button>

                    <button
                        onClick={(e) => handleAction('uninstall', e)}
                        disabled={loading !== null}
                        className="btn btn-sm"
                        style={{
                            fontSize: '0.75rem',
                            background: 'var(--neo-white)',
                            border: '2px solid var(--error)',
                            color: 'var(--error)'
                        }}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};
