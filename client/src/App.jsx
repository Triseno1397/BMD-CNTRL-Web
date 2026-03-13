import { useState, useMemo } from 'react';
import { useATEMState } from './hooks/useATEMState';
import { ConnectionIndicator } from './components/ConnectionIndicator/ConnectionIndicator';
import { NavigationDrawer } from './components/NavigationDrawer/NavigationDrawer';
import { AtemPage } from './components/AtemPage/AtemPage';
import { VideoHubPage } from './components/VideoHubPage/VideoHubPage';
import { HyperDecksPage } from './components/HyperDecksPage/HyperDecksPage';
import { TeranexPage } from './components/TeranexPage/TeranexPage';
import { SettingsPage } from './components/SettingsPage/SettingsPage';
import './App.css';

function App() {
  const [userSelectedPage, setUserSelectedPage] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    atemState,
    videohubState,
    hyperdecksState,
    teranexesState,
    deviceStatus,
    configuredDevices,
    connectionStatus,
    error,
    commandError,
    sendCommand,
    ws
  } = useATEMState();

  const connected = connectionStatus === 'connected';

  // Derive active page from user selection or default based on config
  const activePage = useMemo(() => {
    // If user has explicitly selected a page, use that
    if (userSelectedPage !== null) {
      return userSelectedPage;
    }

    // If we haven't received config yet, show loading
    if (!Array.isArray(configuredDevices)) {
      return null;
    }

    // First-run: no devices configured, show Settings
    if (configuredDevices.length === 0) {
      return 'settings';
    }

    // Default to first configured device type
    const pageMap = {
      atem: 'atem',
      videohub: 'videohub',
      hyperdeck: 'hyperdecks',
      teranex: 'teranex'
    };
    const firstType = configuredDevices[0];
    return pageMap[firstType] || 'settings';
  }, [userSelectedPage, configuredDevices]);

  // Get page title based on active page
  const getPageTitle = () => {
    switch (activePage) {
      case 'atem': return 'ATEM Control';
      case 'videohub': return 'VideoHub';
      case 'hyperdecks': return 'HyperDecks';
      case 'teranex': return 'Teranex';
      case 'settings': return 'Settings';
      default: return 'BMD Control';
    }
  };

  // Handle page change from drawer
  const handlePageChange = (page) => {
    setUserSelectedPage(page);
  };

  return (
    <div className="app">
      {/* Navigation Drawer */}
      <NavigationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activePage={activePage}
        onPageChange={handlePageChange}
        deviceStatus={deviceStatus}
        configuredDevices={configuredDevices}
      />

      {/* Header with hamburger menu */}
      <header className="app__header">
        <button
          className="app__menu-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1>{getPageTitle()}</h1>
        <ConnectionIndicator status={connectionStatus} />
      </header>

      <main className="app__content">
        {activePage === 'atem' && (
          <AtemPage
            atemState={atemState}
            ws={ws}
            connected={connected}
            error={error}
            commandError={commandError}
          />
        )}
        {activePage === 'videohub' && (
          <VideoHubPage
            videohubState={videohubState}
            sendCommand={sendCommand}
          />
        )}
        {activePage === 'hyperdecks' && (
          <HyperDecksPage
            hyperdecksState={hyperdecksState}
            sendCommand={sendCommand}
          />
        )}
        {activePage === 'teranex' && (
          <TeranexPage
            teranexesState={teranexesState}
            sendCommand={sendCommand}
          />
        )}
        {activePage === 'settings' && (
          <SettingsPage
            deviceStatus={deviceStatus}
            onDeviceAdded={() => {
              // Refresh state after device added
              // The WebSocket will broadcast new configuredDevices
            }}
          />
        )}

        {/* Loading state before initial page is set */}
        {activePage === null && (
          <div className="app__loading">
            <div className="app__loading-spinner" />
            <p>Connecting...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
