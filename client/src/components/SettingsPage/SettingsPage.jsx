import { useState, useEffect, useCallback } from 'react';
import './SettingsPage.css';

/**
 * Device type configuration
 */
const DEVICE_TYPES = [
  { value: 'atem', label: 'ATEM Switcher', port: 9910 },
  { value: 'videohub', label: 'VideoHub Router', port: 9990 },
  { value: 'hyperdeck', label: 'HyperDeck Recorder', port: 9993 },
  { value: 'teranex', label: 'Teranex Converter', port: 9800 }
];

/**
 * Settings Page Component
 * Device configuration and network scanning
 */
export function SettingsPage({ deviceStatus, onDeviceAdded }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDevice, setNewDevice] = useState({ type: 'hyperdeck', name: '', ip: '' });
  const [addingDevice, setAddingDevice] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  // Delete confirmation
  const [deletingId, setDeletingId] = useState(null);

  // Network scanner state
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [scanError, setScanError] = useState(null);

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/devices');
      if (!res.ok) throw new Error('Failed to fetch devices');
      const data = await res.json();
      setDevices(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add device
  const handleAddDevice = async (e) => {
    e.preventDefault();
    if (!newDevice.name.trim() || !newDevice.ip.trim()) return;

    try {
      setAddingDevice(true);
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDevice)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add device');
      }

      const added = await res.json();
      setDevices(prev => [...prev, added]);
      setNewDevice({ type: 'hyperdeck', name: '', ip: '' });
      setShowAddForm(false);
      onDeviceAdded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingDevice(false);
    }
  };

  // Update device name
  const handleUpdateDevice = async (id) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }

    try {
      const res = await fetch(`/api/devices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName })
      });

      if (!res.ok) throw new Error('Failed to update device');

      const updated = await res.json();
      setDevices(prev => prev.map(d => d.id === id ? updated : d));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete device
  const handleDeleteDevice = async (id) => {
    try {
      const res = await fetch(`/api/devices/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete device');

      setDevices(prev => prev.filter(d => d.id !== id));
      setDeletingId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // Start editing
  const startEditing = (device) => {
    setEditingId(device.id);
    setEditName(device.name);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
  };

  // Network scan
  const handleScan = async () => {
    try {
      setScanning(true);
      setScanError(null);
      setScanResults([]);

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) throw new Error('Network scan failed');

      const data = await res.json();
      setScanResults(data.found || []);
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  };

  // Add discovered device
  const handleAddDiscovered = async (discovered) => {
    const deviceType = DEVICE_TYPES.find(t => t.value === discovered.type);
    const name = `${deviceType?.label || discovered.type} @ ${discovered.ip}`;

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: discovered.type,
          name,
          ip: discovered.ip
        })
      });

      if (!res.ok) throw new Error('Failed to add device');

      const added = await res.json();
      setDevices(prev => [...prev, added]);

      // Update scan results to mark as added
      setScanResults(prev => prev.map(r =>
        r.ip === discovered.ip && r.type === discovered.type
          ? { ...r, alreadyConfigured: true }
          : r
      ));

      onDeviceAdded?.();
    } catch (err) {
      setError(err.message);
    }
  };

  // Get status LED class
  const getLedClass = (status) => {
    switch (status) {
      case 'connected': return 'settings-led settings-led--green';
      case 'connecting': return 'settings-led settings-led--amber';
      default: return 'settings-led settings-led--red';
    }
  };

  // Get device status
  const getDeviceStatus = useCallback((device) => {
    if (!deviceStatus) return 'disconnected';

    switch (device.type) {
      case 'atem':
        return deviceStatus.atem || 'disconnected';
      case 'videohub':
        return deviceStatus.videohub || 'disconnected';
      case 'hyperdeck': {
        // For individual hyperdecks, we'd need more granular status
        return deviceStatus.hyperdecks?.connected > 0 ? 'connected' : 'disconnected';
      }
      case 'teranex': {
        return deviceStatus.teranexes?.connected > 0 ? 'connected' : 'disconnected';
      }
      default:
        return 'disconnected';
    }
  }, [deviceStatus]);

  // Group devices by type
  const groupedDevices = devices.reduce((acc, device) => {
    const type = device.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(device);
    return acc;
  }, {});

  return (
    <div className="settings-page">
      <div className="settings-page__content">
        {/* Error banner */}
        {error && (
          <div className="settings-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {/* Network Scanner Section */}
        <section className="settings-section">
          <div className="settings-section__header">
            <h2>Network Scanner</h2>
            <span className="settings-section__hint">Find BMD devices on your network</span>
          </div>

          <div className="settings-scanner">
            <button
              className="settings-scanner__btn"
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <span className="settings-spinner" />
                  Scanning...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Scan Network
                </>
              )}
            </button>

            {scanError && (
              <p className="settings-scanner__error">{scanError}</p>
            )}

            {scanResults.length > 0 && (
              <div className="settings-scanner__results">
                <h3>Discovered Devices ({scanResults.length})</h3>
                {scanResults.map((result, index) => (
                  <div key={`${result.ip}-${result.port}-${index}`} className="settings-scanner__result">
                    <div className="settings-scanner__result-info">
                      <span className="settings-scanner__result-type">{result.name}</span>
                      <span className="settings-scanner__result-ip">{result.ip}:{result.port}</span>
                    </div>
                    {result.alreadyConfigured ? (
                      <span className="settings-scanner__result-added">Added</span>
                    ) : (
                      <button
                        className="settings-scanner__result-btn"
                        onClick={() => handleAddDiscovered(result)}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Configured Devices Section */}
        <section className="settings-section">
          <div className="settings-section__header">
            <h2>Configured Devices</h2>
            <span className="settings-section__count">{devices.length} devices</span>
          </div>

          {loading ? (
            <div className="settings-loading">
              <span className="settings-spinner" />
              Loading devices...
            </div>
          ) : devices.length === 0 ? (
            <div className="settings-empty">
              <p>No devices configured</p>
              <p className="settings-empty__hint">
                Use the network scanner above or add devices manually below
              </p>
            </div>
          ) : (
            <div className="settings-devices">
              {DEVICE_TYPES.map(type => {
                const typeDevices = groupedDevices[type.value] || [];
                if (typeDevices.length === 0) return null;

                return (
                  <div key={type.value} className="settings-device-group">
                    <h3 className="settings-device-group__title">
                      {type.label}s ({typeDevices.length})
                    </h3>
                    {typeDevices.map(device => (
                      <div key={device.id} className="settings-device-card">
                        <span className={getLedClass(getDeviceStatus(device))} />
                        <div className="settings-device-card__info">
                          {editingId === device.id ? (
                            <input
                              type="text"
                              className="settings-device-card__name-input"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateDevice(device.id);
                                if (e.key === 'Escape') cancelEditing();
                              }}
                              onBlur={() => handleUpdateDevice(device.id)}
                              autoFocus
                            />
                          ) : (
                            <span className="settings-device-card__name">{device.name}</span>
                          )}
                          <span className="settings-device-card__ip">{device.ip}:{device.port}</span>
                        </div>
                        <div className="settings-device-card__actions">
                          {deletingId === device.id ? (
                            <>
                              <button
                                className="settings-device-card__btn settings-device-card__btn--danger"
                                onClick={() => handleDeleteDevice(device.id)}
                              >
                                Confirm
                              </button>
                              <button
                                className="settings-device-card__btn"
                                onClick={() => setDeletingId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="settings-device-card__btn"
                                onClick={() => startEditing(device)}
                                title="Edit name"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                className="settings-device-card__btn settings-device-card__btn--danger"
                                onClick={() => setDeletingId(device.id)}
                                title="Delete"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Add Device Section */}
        <section className="settings-section">
          {showAddForm ? (
            <form className="settings-add-form" onSubmit={handleAddDevice}>
              <h3>Add Device Manually</h3>
              <div className="settings-add-form__field">
                <label>Device Type</label>
                <select
                  value={newDevice.type}
                  onChange={(e) => setNewDevice(prev => ({ ...prev, type: e.target.value }))}
                >
                  {DEVICE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="settings-add-form__field">
                <label>Device Name</label>
                <input
                  type="text"
                  placeholder="e.g., CAM 1 ISO"
                  value={newDevice.name}
                  onChange={(e) => setNewDevice(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="settings-add-form__field">
                <label>IP Address</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="192.168.1.x"
                  pattern="^(\d{1,3}\.){3}\d{1,3}$"
                  value={newDevice.ip}
                  onChange={(e) => setNewDevice(prev => ({ ...prev, ip: e.target.value }))}
                  required
                />
              </div>
              <div className="settings-add-form__actions">
                <button
                  type="button"
                  className="settings-add-form__btn settings-add-form__btn--cancel"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewDevice({ type: 'hyperdeck', name: '', ip: '' });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="settings-add-form__btn settings-add-form__btn--submit"
                  disabled={addingDevice || !newDevice.name.trim() || !newDevice.ip.trim()}
                >
                  {addingDevice ? 'Adding...' : 'Add Device'}
                </button>
              </div>
            </form>
          ) : (
            <button
              className="settings-add-btn"
              onClick={() => setShowAddForm(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Device Manually
            </button>
          )}
        </section>

        {/* Info Section */}
        <section className="settings-section settings-section--info">
          <h3>Notes</h3>
          <ul>
            <li>ATEM switchers use UDP protocol and may not be detected by network scan. Add them manually if not found.</li>
            <li>Devices will connect automatically after adding. Connection status updates in real-time.</li>
            <li>Device names are for display only and don't affect the connection.</li>
            <li>Changes are saved immediately and persist across restarts.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
