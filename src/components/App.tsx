import React from 'react';
import { getWebUsbSiDeviceDriver } from 'sportident-webusb/lib';
import { SiMainStation } from 'sportident/lib/SiStation';
import { SiMainStationSiCardInsertedEvent, SiMainStationSiCardObservedEvent, SiMainStationSiCardRemovedEvent } from 'sportident/lib/ISiMainStation';
import { SiStationMode } from 'sportident/lib/SiStation/ISiStation';

import { useLocalStorage } from './useLocalStorage';

import '../styles/index.css';

enum CounterMode {
    NOT_CONFIGURED = 'NOT_CONFIGURED',
    CHECK_IN = 'CHECK_IN',
    CHECK_OUT = 'CHECK_OUT',
};

function getModeName(mode: CounterMode) {
    switch (mode) {
        case CounterMode.NOT_CONFIGURED:
            return "Check-in oder check-out starten";
        case CounterMode.CHECK_IN:
            return "Check-in";
        case CounterMode.CHECK_OUT:
            return "Check-out";
    }
}

enum CheckInResult {
    CHECK_IN_SUCCESS = 'CHECK_IN_SUCCESS',
    ALREADY_CHECKED_IN = 'ALREADY_CHECKED_IN',
    CHECK_IN_DENIED = 'CHECK_IN_DENIED',
}

enum CheckOutResult {
    CHECK_OUT_SUCCESS = 'CHECK_OUT_SUCCESS',
    NOT_CHECKED_IN = 'NOT_CHECKED_IN',
}

type OccupancyDict = { [siCardNumber: string]: true };

const App = () => {
    const [occupancyDict, setOccupancyDict] = useLocalStorage<OccupancyDict>('occupancyDict', {});
    const [maxOccupancy, setMaxOccupancy] = useLocalStorage<number>('maxOccupancy', 100);

    const numInside = Object.keys(occupancyDict).length;
    const maxOccupancyNumLetters = `${maxOccupancy}`.length;

    const checkInSiCardNumber = React.useCallback((siCardNumber: number): CheckInResult => {
        const siCardNumberString = `${siCardNumber}`;
        if (siCardNumberString in occupancyDict) {
            return CheckInResult.ALREADY_CHECKED_IN;
        }
        if (numInside >= maxOccupancy) {
            return CheckInResult.CHECK_IN_DENIED;
        }
        const newOccupancyDict: OccupancyDict = {
            ...occupancyDict,
            [siCardNumberString]: true,
        };
        setOccupancyDict(newOccupancyDict);
        return CheckInResult.CHECK_IN_SUCCESS;
    }, [occupancyDict, numInside]);
    const checkOutSiCardNumber = React.useCallback((siCardNumber: number): CheckOutResult => {
        const siCardNumberString = `${siCardNumber}`;
        if (!(siCardNumberString in occupancyDict)) {
            return CheckOutResult.NOT_CHECKED_IN;
        }
        const newOccupancyDict: OccupancyDict = { ...occupancyDict };
        delete newOccupancyDict[siCardNumberString];
        setOccupancyDict(newOccupancyDict);
        return CheckOutResult.CHECK_OUT_SUCCESS;
    }, [occupancyDict]);

    return (
        <>
            <h1 className="title">Corona-Tracing</h1>
            <div className="counters">
                <Counter
                    checkInSiCardNumber={checkInSiCardNumber}
                    checkOutSiCardNumber={checkOutSiCardNumber}
                />
                <Counter
                    checkInSiCardNumber={checkInSiCardNumber}
                    checkOutSiCardNumber={checkOutSiCardNumber}
                />
            </div>
            <div className="situation">
                Besetzung: {numInside} /
                <input
                    value={maxOccupancy}
                    onChange={(e) => setMaxOccupancy(e.target.value)}
                    style={{ width: `${maxOccupancyNumLetters * 10}px` }}
                />
            </div>
        </>
    );
};

const Counter = (props) => {
    const webUsbSiDeviceDriver = React.useMemo(
        () => getWebUsbSiDeviceDriver((window.navigator as any).usb),
        [],
    );
    const [station, setStation] = React.useState<SiMainStation | undefined>(undefined);
    const [mode, setMode] = React.useState<CounterMode>(CounterMode.NOT_CONFIGURED);
    const [result, setResult] = React.useState<CheckInResult | CheckOutResult | undefined>(undefined);
    const setUpCheckIn = React.useCallback(() => {
        webUsbSiDeviceDriver.detect().then((d) => {
            const newStation = SiMainStation.fromSiDevice(d);
            newStation.atomically(() => {
                newStation.setInfo('extendedProtocol', true);
                newStation.setInfo('autoSend', false);
                newStation.setInfo('mode', SiStationMode.Readout);
                newStation.setInfo('code', 10);
                newStation.setInfo('flashes', true);
                newStation.setInfo('beeps', true);
            });
            setStation(newStation);
            setMode(CounterMode.CHECK_IN);
            setResult(undefined);
        });
    }, []);
    const setUpCheckOut = React.useCallback(() => {
        webUsbSiDeviceDriver.detect().then((d) => {
            const newStation = SiMainStation.fromSiDevice(d);
            newStation.atomically(() => {
                newStation.setInfo('extendedProtocol', true);
                newStation.setInfo('autoSend', false);
                newStation.setInfo('mode', SiStationMode.Readout);
                newStation.setInfo('code', 10);
                newStation.setInfo('flashes', true);
                newStation.setInfo('beeps', true);
            });
            setStation(newStation);
            setMode(CounterMode.CHECK_OUT);
            setResult(undefined);
        });
    }, []);

    React.useEffect(() => {
        if (!station) {
            return;
        }
        const handleSiCardInserted = (e: SiMainStationSiCardInsertedEvent) => {
            if (mode === CounterMode.CHECK_IN) {
                const newResult = props.checkInSiCardNumber(e.siCard.cardNumber);
                setResult(newResult);
                e.siCard.confirm();
            }
            if (mode === CounterMode.CHECK_OUT) {
                const newResult = props.checkOutSiCardNumber(e.siCard.cardNumber);
                setResult(newResult);
                e.siCard.confirm();
            }
        };
        const handleSiCardObserved = (e: SiMainStationSiCardObservedEvent) => {
            if (mode === CounterMode.CHECK_IN) {
                const newResult = props.checkInSiCardNumber(e.siCard.cardNumber);
                setResult(newResult);
                e.siCard.confirm();
            }
            if (mode === CounterMode.CHECK_OUT) {
                const newResult = props.checkOutSiCardNumber(e.siCard.cardNumber);
                setResult(newResult);
                e.siCard.confirm();
            }
        };
        const handleSiCardRemoved = (e: SiMainStationSiCardRemovedEvent) => {
            setResult(undefined);
        };
        station.addEventListener('siCardInserted', handleSiCardInserted);
        station.addEventListener('siCardObserved', handleSiCardObserved);
        station.addEventListener('siCardRemoved', handleSiCardRemoved);

        return () => {
            station.removeEventListener('siCardInserted', handleSiCardInserted);
            station.removeEventListener('siCardObserved', handleSiCardObserved);
            station.removeEventListener('siCardRemoved', handleSiCardRemoved);
        };
    }, [station, mode, props.checkInSiCardNumber, props.checkOutSiCardNumber]);

    if (station === undefined) {
        return (
            <div className="counter">
                <div className="counter-content">
                    <div className="set-up-button"><button onClick={setUpCheckIn}>Check-in starten...</button></div>
                    <div className="set-up-button"><button onClick={setUpCheckOut}>Check-out starten...</button></div>
                </div>
            </div>
        );
    }
    return (
        <div className={`counter result-${result}`}>
            <div className="counter-content">
                <h2 className="mode">{getModeName(mode)}</h2>
                <div className="emoji">{getResultEmoji(result)}</div>
                <h3 className="message">{getResultMessage(result)}</h3>
            </div>
        </div>
    );
};

function getResultEmoji(result: CheckInResult | CheckOutResult | undefined) {
    switch (result) {
        case CheckInResult.CHECK_IN_SUCCESS:
            return "😊";
        case CheckInResult.ALREADY_CHECKED_IN:
            return "🤷";
        case CheckInResult.CHECK_IN_DENIED:
            return "✋";
        case CheckOutResult.CHECK_OUT_SUCCESS:
            return "👋";
        case CheckOutResult.NOT_CHECKED_IN:
            return "☝";
        default:
            return "";
    }
}

function getResultMessage(result: CheckInResult | CheckOutResult | undefined) {
    switch (result) {
        case CheckInResult.CHECK_IN_SUCCESS:
            return "Willkommen!";
        case CheckInResult.ALREADY_CHECKED_IN:
            return "Bereits eingecheckt!";
        case CheckInResult.CHECK_IN_DENIED:
            return "Bitte warten!"
        case CheckOutResult.CHECK_OUT_SUCCESS:
            return "Auf Wiedersehen!";
        case CheckOutResult.NOT_CHECKED_IN:
            return "Du warst gar nicht eingecheckt!!!";
        default:
            return "";
    }
}

export default App;
