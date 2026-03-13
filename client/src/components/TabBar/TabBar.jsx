import './TabBar.css';

/**
 * Bottom tab bar for switching between ATEM, VideoHub, HyperDecks, and Teranex pages
 * @param {Object} props
 * @param {'atem' | 'videohub' | 'hyperdecks' | 'teranex'} props.activeTab - Currently active tab
 * @param {Function} props.onTabChange - Callback when tab is selected
 */
export function TabBar({ activeTab, onTabChange }) {
  return (
    <nav className="tab-bar">
      <button
        className={`tab-bar__tab ${activeTab === 'atem' ? 'tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('atem')}
        aria-selected={activeTab === 'atem'}
      >
        <svg className="tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
        <span className="tab-bar__label">ATEM</span>
      </button>

      <button
        className={`tab-bar__tab ${activeTab === 'videohub' ? 'tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('videohub')}
        aria-selected={activeTab === 'videohub'}
      >
        <svg className="tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <circle cx="7" cy="9" r="1.5" fill="currentColor" />
          <circle cx="12" cy="9" r="1.5" fill="currentColor" />
          <circle cx="17" cy="9" r="1.5" fill="currentColor" />
          <circle cx="7" cy="15" r="1.5" fill="currentColor" />
          <circle cx="12" cy="15" r="1.5" fill="currentColor" />
          <circle cx="17" cy="15" r="1.5" fill="currentColor" />
        </svg>
        <span className="tab-bar__label">VIDEOHUB</span>
      </button>

      <button
        className={`tab-bar__tab ${activeTab === 'hyperdecks' ? 'tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('hyperdecks')}
        aria-selected={activeTab === 'hyperdecks'}
      >
        <svg className="tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {/* HyperDeck recorder icon - cassette/deck style */}
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <circle cx="7" cy="12" r="2" />
          <circle cx="17" cy="12" r="2" />
          <rect x="9" y="10" width="6" height="4" rx="1" />
          <circle cx="7" cy="12" r="0.5" fill="currentColor" />
          <circle cx="17" cy="12" r="0.5" fill="currentColor" />
        </svg>
        <span className="tab-bar__label">HYPERDECKS</span>
      </button>

      <button
        className={`tab-bar__tab ${activeTab === 'teranex' ? 'tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('teranex')}
        aria-selected={activeTab === 'teranex'}
      >
        <svg className="tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {/* Teranex converter icon - format conversion arrows */}
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M7 9h4l-2-2" />
          <path d="M7 9l2 2" />
          <path d="M17 15h-4l2 2" />
          <path d="M17 15l-2-2" />
          <circle cx="7" cy="15" r="1" fill="currentColor" />
          <circle cx="17" cy="9" r="1" fill="currentColor" />
        </svg>
        <span className="tab-bar__label">TERANEX</span>
      </button>
    </nav>
  );
}
