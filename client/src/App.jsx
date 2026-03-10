import { useState } from 'react';
import { useATEMState } from './hooks/useATEMState';
import { ConnectionIndicator } from './components/ConnectionIndicator/ConnectionIndicator';
import { TabBar } from './components/TabBar/TabBar';
import { AtemPage } from './components/AtemPage/AtemPage';
import { VideoHubPage } from './components/VideoHubPage/VideoHubPage';
import { HyperDecksPage } from './components/HyperDecksPage/HyperDecksPage';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('atem');
  const { atemState, videohubState, hyperdecksState, connectionStatus, error, commandError, sendCommand, ws } = useATEMState();
  const connected = connectionStatus === 'connected';

  // Get page title based on active tab
  const getPageTitle = () => {
    switch (activeTab) {
      case 'atem': return 'ATEM Control';
      case 'videohub': return 'VideoHub';
      case 'hyperdecks': return 'HyperDecks';
      default: return 'BMD Control';
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>{getPageTitle()}</h1>
        <ConnectionIndicator status={connectionStatus} />
      </header>

      <main className="app__content">
        {activeTab === 'atem' && (
          <AtemPage
            atemState={atemState}
            ws={ws}
            connected={connected}
            error={error}
            commandError={commandError}
          />
        )}
        {activeTab === 'videohub' && (
          <VideoHubPage
            videohubState={videohubState}
            sendCommand={sendCommand}
          />
        )}
        {activeTab === 'hyperdecks' && (
          <HyperDecksPage
            hyperdecksState={hyperdecksState}
            sendCommand={sendCommand}
          />
        )}
      </main>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default App;
