import { useEffect } from 'react';
import './NavigationDrawer.css';

/**
 * Navigation item definition
 */
const NAV_ITEMS = [
  { id: 'atem', label: 'ATEM Control', type: 'atem', icon: 'switcher' },
  { id: 'videohub', label: 'VideoHub', type: 'videohub', icon: 'router' },
  { id: 'hyperdecks', label: 'HyperDecks', type: 'hyperdeck', icon: 'recorder' },
  { id: 'teranex', label: 'Teranex', type: 'teranex', icon: 'converter' }
];

/**
 * Get connection status for a device type
 */
function getStatusForType(type, deviceStatus) {
  if (!deviceStatus) return 'disconnected';

  switch (type) {
    case 'atem':
      return deviceStatus.atem || 'disconnected';
    case 'videohub':
      return deviceStatus.videohub || 'disconnected';
    case 'hyperdeck': {
      const hd = deviceStatus.hyperdecks;
      if (!hd || hd.total === 0) return 'disconnected';
      if (hd.connected === hd.total) return 'connected';
      if (hd.connected > 0) return 'partial';
      return 'disconnected';
    }
    case 'teranex': {
      const tx = deviceStatus.teranexes;
      if (!tx || tx.total === 0) return 'disconnected';
      if (tx.connected === tx.total) return 'connected';
      if (tx.connected > 0) return 'partial';
      return 'disconnected';
    }
    default:
      return 'disconnected';
  }
}

/**
 * Get LED class based on status
 */
function getLedClass(status) {
  switch (status) {
    case 'connected':
      return 'nav-led nav-led--green';
    case 'connecting':
    case 'partial':
      return 'nav-led nav-led--amber';
    case 'disconnected':
    default:
      return 'nav-led nav-led--red';
  }
}

/**
 * Device icon component
 */
function DeviceIcon({ type }) {
  switch (type) {
    case 'switcher':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="7" y1="9" x2="7" y2="15" />
          <line x1="12" y1="9" x2="12" y2="15" />
          <line x1="17" y1="9" x2="17" y2="15" />
        </svg>
      );
    case 'router':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </svg>
      );
    case 'recorder':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <circle cx="7" cy="12" r="2" />
          <circle cx="17" cy="12" r="2" />
          <rect x="9" y="10" width="6" height="4" rx="1" />
        </svg>
      );
    case 'converter':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M8 12h8M14 9l3 3-3 3" />
        </svg>
      );
    case 'settings':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Navigation Drawer Component
 * Slide-in drawer from left side with device navigation and settings
 */
export function NavigationDrawer({
  isOpen,
  onClose,
  activePage,
  onPageChange,
  deviceStatus,
  configuredDevices = []
}) {
  // Close drawer on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Filter nav items to only show configured device types
  const visibleNavItems = NAV_ITEMS.filter(item =>
    configuredDevices.includes(item.type)
  );

  const handleNavClick = (pageId) => {
    onPageChange(pageId);
    onClose();
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`nav-drawer-overlay ${isOpen ? 'nav-drawer-overlay--visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <nav
        className={`nav-drawer ${isOpen ? 'nav-drawer--open' : ''}`}
        aria-label="Main navigation"
      >
        {/* Header */}
        <div className="nav-drawer__header">
          <span className="nav-drawer__title">ANTIGRAVITY</span>
          <span className="nav-drawer__subtitle">BMD Control</span>
        </div>

        {/* Device navigation items */}
        <div className="nav-drawer__items">
          {visibleNavItems.length === 0 ? (
            <div className="nav-drawer__empty">
              <p>No devices configured</p>
              <p className="nav-drawer__empty-hint">Add devices in Settings</p>
            </div>
          ) : (
            visibleNavItems.map(item => {
              const status = getStatusForType(item.type, deviceStatus);
              return (
                <button
                  key={item.id}
                  className={`nav-item ${activePage === item.id ? 'nav-item--active' : ''}`}
                  onClick={() => handleNavClick(item.id)}
                >
                  <span className={getLedClass(status)} />
                  <DeviceIcon type={item.icon} />
                  <span className="nav-item__label">{item.label}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Divider */}
        <div className="nav-drawer__divider" />

        {/* Settings item - always visible */}
        <div className="nav-drawer__footer">
          <button
            className={`nav-item nav-item--settings ${activePage === 'settings' ? 'nav-item--active' : ''}`}
            onClick={() => handleNavClick('settings')}
          >
            <DeviceIcon type="settings" />
            <span className="nav-item__label">Settings</span>
          </button>
        </div>
      </nav>
    </>
  );
}
