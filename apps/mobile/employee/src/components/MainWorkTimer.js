import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { calculateLiveWorkMs, formatTimerSeconds } from '../utils/workMetrics';

/**
 * Main Work Timer Component (Continuous net focus time minus breaks)
 * Recomputes live work elapsed every 1000ms.
 */
export const MainWorkTimer = ({
  checkInTime,
  checkOutTime,
  breaks = [],
  activeBreak = null,
  style,
}) => {
  const [netSeconds, setNetSeconds] = useState(0);

  useEffect(() => {
    if (!checkInTime) {
      setNetSeconds(0);
      return;
    }

    const calc = () =>
      Math.floor(
        calculateLiveWorkMs(checkInTime, checkOutTime, breaks, activeBreak) / 1000
      );

    setNetSeconds(calc());
    const interval = setInterval(() => setNetSeconds(calc()), 1000);
    return () => clearInterval(interval);
  }, [checkInTime, checkOutTime, breaks, activeBreak]);

  return (
    <Text style={[styles.mainTimerText, style]}>
      {formatTimerSeconds(netSeconds)}
    </Text>
  );
};

/**
 * Compact Live Work Timer for KPI Tile
 */
export const MainWorkTimerKpi = ({
  checkInTime,
  checkOutTime,
  breaks = [],
  activeBreak = null,
  style,
}) => {
  const [netSeconds, setNetSeconds] = useState(0);

  useEffect(() => {
    if (!checkInTime) {
      setNetSeconds(0);
      return;
    }

    const calc = () =>
      Math.floor(
        calculateLiveWorkMs(checkInTime, checkOutTime, breaks, activeBreak) / 1000
      );

    setNetSeconds(calc());
    const interval = setInterval(() => setNetSeconds(calc()), 1000);
    return () => clearInterval(interval);
  }, [checkInTime, checkOutTime, breaks, activeBreak]);

  if (!checkInTime) {
    return <Text style={[styles.kpiTimerText, style]}>--:--:--</Text>;
  }

  const hours = Math.floor(netSeconds / 3600);
  const minutes = Math.floor((netSeconds % 3600) / 60);
  const seconds = netSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');

  return (
    <Text style={[styles.kpiTimerText, style]}>
      {`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`}
    </Text>
  );
};

const styles = StyleSheet.create({
  mainTimerText: {
    fontFamily: 'monospace',
    fontSize: 34,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 1.5,
  },
  kpiTimerText: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: '#0284c7',
  },
});

export default MainWorkTimer;
