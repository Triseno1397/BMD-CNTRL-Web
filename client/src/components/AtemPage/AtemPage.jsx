import { CameraSourceGrid } from '../CameraSourceGrid/CameraSourceGrid';
import { AutoButton } from '../AutoButton/AutoButton';
import { KeyerButton } from '../KeyerButton/KeyerButton';
import { DSKButton } from '../DSKButton/DSKButton';
import { BARSButton } from '../BARSButton/BARSButton';
import { FTBButton } from '../FTBButton/FTBButton';
import { AUXPanel } from '../AUXPanel/AUXPanel';
import './AtemPage.css';

/**
 * ATEM control page - contains all M/E controls
 * @param {Object} props
 * @param {Object} props.atemState - Current ATEM state from WebSocket
 * @param {WebSocket} props.ws - WebSocket connection for sending commands
 * @param {boolean} props.connected - Whether WebSocket is connected
 * @param {Object} props.error - WebSocket error if any
 * @param {Object} props.commandError - Command error if any
 */
export function AtemPage({ atemState, ws, connected, error, commandError }) {
  // Extract transition state
  const mixEffect = atemState?.video?.mixEffects?.[0];
  const transitionRate = mixEffect?.transitionSettings?.mix?.rate ?? 30;
  const inTransition = mixEffect?.transitionPosition?.inTransition ?? false;

  // Extract USK1 state
  const usk1 = mixEffect?.upstreamKeyers?.[0];
  const usk1OnAir = usk1?.onAir ?? false;

  // Extract DSK1 state
  const dsk1 = atemState?.video?.downstreamKeyers?.[0];
  const dsk1OnAir = dsk1?.onAir ?? false;

  // Extract FTB state
  const ftb = mixEffect?.fadeToBlack;
  const ftbIsFullyBlack = ftb?.isFullyBlack ?? false;
  const ftbInTransition = ftb?.inTransition ?? false;
  const ftbRate = ftb?.rate ?? 30;

  // Extract BARS state (input 1000)
  const programInput = mixEffect?.programInput;
  const previewInput = mixEffect?.previewInput;
  const barsIsProgrammed = programInput === 1000;
  const barsIsPreviewed = previewInput === 1000;

  // Extract AUX state
  const auxilliaries = atemState?.video?.auxilliaries ?? [];
  const inputs = atemState?.inputs ?? {};

  return (
    <div className="atem-page">
      {error && (
        <div className="atem-page__error">
          WebSocket Error: {error.message}
        </div>
      )}
      {commandError && (
        <div className="atem-page__error">
          Command Error ({commandError.command}): {commandError.error}
        </div>
      )}

      <CameraSourceGrid atemState={atemState} ws={ws} connected={connected} />

      <AutoButton
        ws={ws}
        connected={connected}
        transitionRate={transitionRate}
        inTransition={inTransition}
      />

      <div className="atem-page__bottom-row">
        <div className="atem-page__keyer-column">
          <KeyerButton
            ws={ws}
            connected={connected}
            keyerIndex={0}
            onAir={usk1OnAir}
            label="USK1"
          />
          <DSKButton
            ws={ws}
            connected={connected}
            keyerIndex={0}
            onAir={dsk1OnAir}
            label="DSK1"
          />
        </div>
        <div className="atem-page__special-sources">
          <BARSButton
            ws={ws}
            connected={connected}
            isProgrammed={barsIsProgrammed}
            isPreviewed={barsIsPreviewed}
          />
          <FTBButton
            ws={ws}
            connected={connected}
            isFullyBlack={ftbIsFullyBlack}
            inTransition={ftbInTransition}
            rate={ftbRate}
          />
        </div>
      </div>

      <AUXPanel
        ws={ws}
        connected={connected}
        auxilliaries={auxilliaries}
        inputs={inputs}
      />
    </div>
  );
}
