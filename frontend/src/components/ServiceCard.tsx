/**
 * ServiceCard Component - Warm Neo-Brutalism Theme
 */
import React from 'react';
import type { BrewService } from '../types';
import { Play, Square, RotateCcw, Activity } from 'lucide-react';
import { getLogoUrl, getUiAvatar } from '../utils';

interface ServiceCardProps {
    service: BrewService;
    onRefresh?: () => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, onRefresh }) => {
    const [loading, setLoading] = React.useState(false);

    const handleAction = async (action: 'start' | 'stop' | 'restart') => {
        setLoading(true);
        try {
            await fetch(`http://localhost:8080/api/services/control?name=${service.name}&action=${action}`, { method: 'POST' });
            onRefresh?.();
        } catch (e) {
            alert(`Failed to ${action} service`);
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const isRunning = service.status === 'started';
    const logoData = getLogoUrl(service.homepage);

    return (
        <div
            className="neo-card animate-entry"
            style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                transition: 'transform 0.15s',
                cursor: 'default',
                opacity: loading ? 0.5 : 1,
                pointerEvents: loading ? 'none' : 'auto'
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {/* Logo */}
                    {logoData ? (
                        <img
                            src={logoData.primary}
                            alt={service.name}
                            style={{
                                width: '48px',
                                height: '48px',
                                border: '3px solid var(--neo-black)',
                                borderRadius: 'var(--radius-sm)',
                                objectFit: 'contain',
                                background: 'var(--neo-white)',
                                padding: '4px',
                                boxShadow: 'var(--shadow-sm)'
                            }}
                            onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                if (img.src === logoData.primary) {
                                    img.src = logoData.fallback;
                                } else if (img.src === logoData.fallback) {
                                    img.src = getUiAvatar(service.name);
                                }
                            }}
                        />
                    ) : (
                        <div style={{
                            width: '48px',
                            height: '48px',
                            background: isRunning ? 'var(--success)' : 'var(--neo-skin)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '3px solid var(--neo-black)',
                            borderRadius: 'var(--radius-sm)',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            <Activity
                                size={24}
                                color={isRunning ? 'var(--neo-black)' : 'var(--text-secondary)'}
                            />
                        </div>
                    )}

                    {/* Name & Status */}
                    <div>
                        <h3 style={{
                            fontSize: '1.1rem',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            textTransform: 'uppercase'
                        }}>
                            {service.name}
                        </h3>
                        <div
                            className={`status-indicator ${isRunning ? 'status-online' : 'status-offline'}`}
                            style={{ marginTop: '6px' }}
                        >
                            <span className="status-dot" />
                            {service.status.toUpperCase()}
                        </div>
                    </div>
                </div>

                {/* User Badge */}
                {service.user && (
                    <span className="neo-badge" style={{
                        background: 'var(--neo-skin)',
                        color: 'var(--text-primary)',
                        fontSize: '0.75rem'
                    }}>
                        user: {service.user}
                    </span>
                )}
            </div>

            {/* Actions */}
            <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: 'auto',
                borderTop: '3px solid var(--neo-black)',
                paddingTop: '16px'
            }}>
                {!isRunning ? (
                    <button
                        className="btn btn-primary"
                        onClick={() => handleAction('start')}
                        style={{
                            flex: 1,
                            justifyContent: 'center'
                        }}
                    >
                        <Play size={16} fill="currentColor" style={{ marginRight: '8px' }} />
                        START
                    </button>
                ) : (
                    <button
                        className="btn btn-danger"
                        onClick={() => handleAction('stop')}
                        style={{
                            flex: 1,
                            justifyContent: 'center'
                        }}
                    >
                        <Square size={16} fill="currentColor" style={{ marginRight: '8px' }} />
                        STOP
                    </button>
                )}

                <button
                    className="btn btn-outline btn-icon"
                    onClick={() => handleAction('restart')}
                    title="Restart"
                >
                    <RotateCcw size={16} />
                </button>
            </div>
        </div>
    );
};
