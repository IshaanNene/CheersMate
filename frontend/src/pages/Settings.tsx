/**
 * Settings Page - Extended with All Features
 */
import React, { useState, useEffect } from 'react';
import {
    RefreshCw, Trash2, Wrench, Download,
    Stethoscope, History, Clock,
    X, Check, AlertTriangle, ChevronDown
} from 'lucide-react';
import type { BrewPackage, PackageGroup, UninstalledPackage, HealthCheckResult } from '../types';
import {
    getGroups,
    createGroup,
    deleteGroup,
    getRecentlyUninstalled,
    removeFromUninstalled,
    getAutoUpdateConfig,
    setAutoUpdateConfig
} from '../userStore';

interface SettingsProps {
    onRefresh?: () => void;
    packages?: BrewPackage[];
}

export const Settings: React.FC<SettingsProps> = ({ onRefresh, packages = [] }) => {
    const [status, setStatus] = useState<string | null>(null);
    const [isError, setIsError] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);

    // Groups
    const [groups, setGroups] = useState<PackageGroup[]>([]);
    const [newGroupName, setNewGroupName] = useState('');
    const [showNewGroupInput, setShowNewGroupInput] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Recently Uninstalled
    const [recentlyUninstalled, setRecentlyUninstalled] = useState<UninstalledPackage[]>([]);

    // Health Check
    const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);

    // Auto Update
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
    const [autoUpdateDays, setAutoUpdateDays] = useState(7);

    useEffect(() => {
        setGroups(getGroups());
        setRecentlyUninstalled(getRecentlyUninstalled());
        const config = getAutoUpdateConfig();
        setAutoUpdateEnabled(config.enabled);
        setAutoUpdateDays(config.intervalDays);
    }, []);

    const runAction = async (action: string, endpoint: string) => {
        setLoading(action);
        setStatus(null);

        try {
            const response = await fetch(`http://localhost:8080/api/${endpoint}`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error(`Failed to run ${action}`);

            await response.text();
            setStatus(`${action} completed successfully!`);
            setIsError(false);
            onRefresh?.();
        } catch (err) {
            console.error(err);
            setStatus(`Failed to run ${action}. Check backend connection.`);
            setIsError(true);
        } finally {
            setLoading(null);
        }
    };

    // Create new group
    const handleCreateGroup = () => {
        if (!newGroupName.trim()) return;

        const colors = ['#FFBE98', '#FF7F6E', '#98D8AA', '#B4A7D6', '#FFD93D'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        createGroup(newGroupName.trim(), randomColor);
        setGroups(getGroups());
        setNewGroupName('');
        setShowNewGroupInput(false);
    };

    // Delete group
    const handleDeleteGroup = (groupId: string) => {
        if (confirm('Are you sure you want to delete this group?')) {
            deleteGroup(groupId);
            setGroups(getGroups());
        }
    };

    // Toggle group expansion
    const toggleGroupExpanded = (groupId: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupId)) {
            newExpanded.delete(groupId);
        } else {
            newExpanded.add(groupId);
        }
        setExpandedGroups(newExpanded);
    };

    // Reinstall package
    const handleReinstall = async (pkg: UninstalledPackage) => {
        setLoading(`reinstall-${pkg.name}`);
        try {
            const response = await fetch(`http://localhost:8080/api/packages/${pkg.name}/install`, {
                method: 'POST'
            });

            if (response.ok) {
                removeFromUninstalled(pkg.name);
                setRecentlyUninstalled(getRecentlyUninstalled());
                setStatus(`${pkg.name} reinstalled successfully!`);
                setIsError(false);
                onRefresh?.();
            } else {
                throw new Error('Install failed');
            }
        } catch (err) {
            setStatus(`Failed to reinstall ${pkg.name}`);
            setIsError(true);
        } finally {
            setLoading(null);
        }
    };

    // Health Check
    const runHealthCheck = async () => {
        setLoading('health');
        try {
            const response = await fetch('http://localhost:8080/api/doctor', { method: 'POST' });
            const data = await response.json();
            setHealthResult({
                issues: data.issues || [],
                isHealthy: data.issues?.length === 0,
                checkedAt: new Date().toISOString()
            });
        } catch (err) {
            setHealthResult({
                issues: [{ type: 'error', message: 'Could not run health check. Backend may be offline.' }],
                isHealthy: false,
                checkedAt: new Date().toISOString()
            });
        } finally {
            setLoading(null);
        }
    };

    // Export Brewfile
    const handleExport = () => {
        const brewfile = packages.map(pkg => `brew "${pkg.name}"`).join('\n');

        const blob = new Blob([brewfile], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Brewfile';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Toggle auto-update
    const toggleAutoUpdate = () => {
        const newEnabled = !autoUpdateEnabled;
        setAutoUpdateEnabled(newEnabled);
        setAutoUpdateConfig({ enabled: newEnabled, intervalDays: autoUpdateDays });
    };

    return (
        <div className="animate-entry" style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
            {/* Page Header */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                    padding: '8px 16px',
                    background: 'var(--neo-skin)',
                    border: '3px solid var(--neo-black)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <Wrench size={20} />
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                        System Tools
                    </span>
                </div>
                <h2 className="heading-xl" style={{ marginBottom: '8px' }}>Settings & Maintenance</h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Manage your Homebrew installation, groups, and preferences
                </p>
            </div>

            {/* Status Banner */}
            {status && (
                <div style={{
                    padding: '16px',
                    marginBottom: '24px',
                    background: isError ? 'var(--error)' : 'var(--success)',
                    color: isError ? 'var(--neo-white)' : 'var(--neo-black)',
                    border: '3px solid var(--neo-black)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <span>{status}</span>
                    <button onClick={() => setStatus(null)} style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit'
                    }}>
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Main Actions Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '32px' }}>
                {/* Update Card */}
                <div className="neo-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                        <div style={{
                            padding: '14px',
                            background: 'var(--neo-peach)',
                            border: '3px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-sm)',
                            flexShrink: 0
                        }}>
                            <RefreshCw size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
                                Update Homebrew
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Fetch latest formulae and casks from repositories
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={() => runAction('update', 'update')}
                        disabled={loading !== null}
                        style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                    >
                        {loading === 'update' ? 'UPDATING...' : 'RUN UPDATE'}
                    </button>
                </div>

                {/* Cleanup Card */}
                <div className="neo-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                        <div style={{
                            padding: '14px',
                            background: 'var(--neo-coral)',
                            border: '3px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-sm)',
                            flexShrink: 0,
                            color: 'var(--neo-white)'
                        }}>
                            <Trash2 size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
                                Cleanup
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Remove old versions and clear download cache
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn btn-outline"
                        onClick={() => runAction('cleanup', 'cleanup')}
                        disabled={loading !== null}
                        style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                    >
                        {loading === 'cleanup' ? 'CLEANING...' : 'RUN CLEANUP'}
                    </button>
                </div>

                {/* Health Check Card */}
                <div className="neo-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                        <div style={{
                            padding: '14px',
                            background: 'var(--neo-mint)',
                            border: '3px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-sm)',
                            flexShrink: 0
                        }}>
                            <Stethoscope size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
                                Health Check
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Run brew doctor to diagnose issues
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={runHealthCheck}
                        disabled={loading !== null}
                        style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                    >
                        {loading === 'health' ? 'CHECKING...' : 'RUN DOCTOR'}
                    </button>
                </div>

                {/* Export Card */}
                <div className="neo-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                        <div style={{
                            padding: '14px',
                            background: 'var(--neo-skin)',
                            border: '3px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-sm)',
                            flexShrink: 0
                        }}>
                            <Download size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
                                Export Brewfile
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Export {packages.length} packages to a Brewfile
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleExport}
                        disabled={packages.length === 0}
                        style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                    >
                        EXPORT
                    </button>
                </div>
            </div>

            {/* Health Check Results */}
            {healthResult && (
                <div className="neo-card" style={{ padding: '20px', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        {healthResult.isHealthy ? (
                            <Check size={24} color="var(--success)" />
                        ) : (
                            <AlertTriangle size={24} color="var(--warning)" />
                        )}
                        <h3 style={{ fontWeight: 800, textTransform: 'uppercase' }}>
                            {healthResult.isHealthy ? 'All Good!' : `${healthResult.issues.length} Issues Found`}
                        </h3>
                    </div>
                    {healthResult.issues.map((issue, i) => (
                        <div key={i} style={{
                            padding: '12px',
                            marginBottom: '8px',
                            background: issue.type === 'error' ? 'rgba(255,107,107,0.1)' : 'rgba(255,190,0,0.1)',
                            border: `2px solid ${issue.type === 'error' ? 'var(--error)' : 'var(--warning)'}`,
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.9rem'
                        }}>
                            {issue.message}
                        </div>
                    ))}
                </div>
            )}

            {/* Groups */}
            <div className="neo-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h3 style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '1.1rem' }}>Package Groups</h3>
                    <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setShowNewGroupInput(!showNewGroupInput)}
                    >
                        {showNewGroupInput ? 'CANCEL' : '+ NEW GROUP'}
                    </button>
                </div>

                {/* New Group Input */}
                {showNewGroupInput && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                        <input
                            type="text"
                            placeholder="Enter group name..."
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleCreateGroup()}
                            style={{
                                flex: 1,
                                padding: '12px',
                                border: '2px solid var(--neo-black)',
                                borderRadius: 'var(--radius-md)',
                                fontFamily: 'inherit',
                                fontSize: '0.95rem'
                            }}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleCreateGroup}
                            disabled={!newGroupName.trim()}
                        >
                            CREATE
                        </button>
                    </div>
                )}

                {/* Groups List */}
                {groups.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {groups.map(group => (
                            <div key={group.id}>
                                <div
                                    onClick={() => toggleGroupExpanded(group.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px',
                                        background: 'var(--neo-white)',
                                        border: '2px solid var(--neo-black)',
                                        borderRadius: expandedGroups.has(group.id) ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--neo-cream)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--neo-white)'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                        <span style={{
                                            width: '16px',
                                            height: '16px',
                                            background: group.color,
                                            borderRadius: '50%',
                                            border: '2px solid var(--neo-black)',
                                            flexShrink: 0
                                        }} />
                                        <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                                            {group.name}
                                        </span>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-secondary)',
                                            background: 'var(--neo-skin)',
                                            padding: '2px 8px',
                                            borderRadius: 'var(--radius-sm)'
                                        }}>
                                            {group.packages?.length || 0} packages
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <ChevronDown
                                            size={18}
                                            style={{
                                                transform: expandedGroups.has(group.id) ? 'rotate(180deg)' : 'rotate(0deg)',
                                                transition: 'transform 0.2s',
                                                flexShrink: 0
                                            }}
                                        />
                                        <button
                                            className="btn btn-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteGroup(group.id);
                                            }}
                                            style={{
                                                background: 'var(--neo-white)',
                                                border: '2px solid var(--error)',
                                                color: 'var(--error)',
                                                padding: '6px 12px'
                                            }}
                                        >
                                            DELETE
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Packages List */}
                                {expandedGroups.has(group.id) && (
                                    <div style={{
                                        background: 'var(--neo-cream)',
                                        border: '2px solid var(--neo-black)',
                                        borderTop: 'none',
                                        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                                        padding: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        {group.packages && group.packages.length > 0 ? (
                                            group.packages.map(pkgName => (
                                                <div
                                                    key={pkgName}
                                                    style={{
                                                        padding: '10px 12px',
                                                        background: 'var(--neo-white)',
                                                        border: '1px solid var(--neo-black)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: '0.9rem',
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase'
                                                    }}
                                                >
                                                    {pkgName}
                                                </div>
                                            ))
                                        ) : (
                                            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '8px' }}>
                                                No packages in this group
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        No groups yet. Create one to organize your packages!
                    </p>
                )}
            </div>

            {/* Recently Uninstalled */}
            {recentlyUninstalled.length > 0 && (
                <div className="neo-card" style={{ padding: '24px', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{
                            padding: '10px',
                            background: 'var(--neo-coral)',
                            border: '2px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--neo-white)'
                        }}>
                            <History size={20} />
                        </div>
                        <h3 style={{ fontWeight: 800, textTransform: 'uppercase' }}>Recently Uninstalled</h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {recentlyUninstalled.slice(0, 5).map(pkg => (
                            <div key={pkg.name} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px',
                                background: 'var(--neo-white)',
                                border: '2px solid var(--neo-black)',
                                borderRadius: 'var(--radius-md)'
                            }}>
                                <div>
                                    <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                                        {pkg.name}
                                    </span>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-secondary)',
                                        marginLeft: '8px'
                                    }}>
                                        v{pkg.version}
                                    </span>
                                </div>
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => handleReinstall(pkg)}
                                    disabled={loading === `reinstall-${pkg.name}`}
                                >
                                    {loading === `reinstall-${pkg.name}` ? '...' : 'REINSTALL'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Auto-Update Toggle */}
            <div className="neo-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            padding: '10px',
                            background: 'var(--neo-skin)',
                            border: '2px solid var(--neo-black)',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            <Clock size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                                Auto-Update Schedule
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {autoUpdateEnabled
                                    ? `Updates every ${autoUpdateDays} days`
                                    : 'Automatic updates are disabled'
                                }
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={toggleAutoUpdate}
                        style={{
                            width: '60px',
                            height: '32px',
                            borderRadius: '16px',
                            border: '2px solid var(--neo-black)',
                            background: autoUpdateEnabled ? 'var(--neo-mint)' : 'var(--neo-white)',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'background 0.2s'
                        }}
                    >
                        <span style={{
                            position: 'absolute',
                            top: '3px',
                            left: autoUpdateEnabled ? '30px' : '3px',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: 'var(--neo-black)',
                            transition: 'left 0.2s'
                        }} />
                    </button>
                </div>
            </div>
        </div>
    );
};
